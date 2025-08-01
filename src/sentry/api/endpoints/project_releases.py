from __future__ import annotations

import sentry_sdk
from django.db import IntegrityError, router, transaction
from django.db.models import Q
from rest_framework.request import Request
from rest_framework.response import Response

from sentry import analytics
from sentry.analytics.events.release_created import ReleaseCreatedEvent
from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import region_silo_endpoint
from sentry.api.bases.project import ProjectEndpoint, ProjectReleasePermission
from sentry.api.helpers.environments import get_environment
from sentry.api.paginator import OffsetPaginator
from sentry.api.serializers import serialize
from sentry.api.serializers.rest_framework import ReleaseWithVersionSerializer
from sentry.api.utils import get_auth_api_token_type
from sentry.models.activity import Activity
from sentry.models.environment import Environment
from sentry.models.orgauthtoken import is_org_auth_token_auth, update_org_auth_token_last_used
from sentry.models.release import Release, ReleaseStatus
from sentry.plugins.interfaces.releasehook import ReleaseHook
from sentry.ratelimits.config import SENTRY_RATELIMITER_GROUP_DEFAULTS, RateLimitConfig
from sentry.signals import release_created
from sentry.types.activity import ActivityType
from sentry.utils.sdk import bind_organization_context


@region_silo_endpoint
class ProjectReleasesEndpoint(ProjectEndpoint):
    publish_status = {
        "GET": ApiPublishStatus.UNKNOWN,
        "POST": ApiPublishStatus.UNKNOWN,
    }
    permission_classes = (ProjectReleasePermission,)
    rate_limits = RateLimitConfig(
        group="CLI", limit_overrides={"GET": SENTRY_RATELIMITER_GROUP_DEFAULTS["default"]}
    )

    def get(self, request: Request, project) -> Response:
        """
        List a Project's Releases
        `````````````````````````

        Retrieve a list of releases for a given project.

        :pparam string organization_id_or_slug: the id or slug of the organization the
                                          release belongs to.
        :pparam string project_id_or_slug: the id or slug of the project to list the
                                     releases of.
        :qparam string query: this parameter can be used to create a
                              "starts with" filter for the version.
        """
        query = request.GET.get("query")
        try:
            environment = get_environment(request, project.organization_id)
        except Environment.DoesNotExist:
            queryset = Release.objects.none()
            environment = None
        else:
            queryset = Release.objects.filter(
                projects=project,
                organization_id=project.organization_id,
            ).filter(Q(status=ReleaseStatus.OPEN) | Q(status=None))
            if environment is not None:
                queryset = queryset.filter(
                    releaseprojectenvironment__project=project,
                    releaseprojectenvironment__environment=environment,
                )

        if query:
            queryset = queryset.filter(version__icontains=query)

        return self.paginate(
            request=request,
            queryset=queryset.extra(select={"sort": "COALESCE(date_released, date_added)"}),
            order_by="-sort",
            paginator_cls=OffsetPaginator,
            on_results=lambda x: serialize(
                x, request.user, project=project, environment=environment
            ),
        )

    def post(self, request: Request, project) -> Response:
        """
        Create a New Release for a Project
        ``````````````````````````````````

        Create a new release and/or associate a project with a release.
        Release versions that are the same across multiple projects
        within an Organization will be treated as the same release in Sentry.

        Releases are used by Sentry to improve its error reporting abilities
        by correlating first seen events with the release that might have
        introduced the problem.

        Releases are also necessary for sourcemaps and other debug features
        that require manual upload for functioning well.

        :pparam string organization_id_or_slug: the id or slug of the organization the
                                          release belongs to.
        :pparam string project_id_or_slug: the id or slug of the project to create a
                                     release for.
        :param string version: a version identifier for this release.  Can
                               be a version number, a commit hash etc.
        :param string ref: an optional commit reference.  This is useful if
                           a tagged version has been provided.
        :param url url: a URL that points to the release.  This can be the
                        path to an online interface to the sourcecode
                        for instance.
        :param datetime dateReleased: an optional date that indicates when
                                      the release went live.  If not provided
                                      the current time is assumed.
        :auth: required
        """
        bind_organization_context(project.organization)
        serializer = ReleaseWithVersionSerializer(
            data=request.data, context={"organization": project.organization}
        )

        scope = sentry_sdk.get_isolation_scope()

        if serializer.is_valid():
            result = serializer.validated_data
            scope.set_tag("version", result["version"])

            new_status = result.get("status")

            # release creation is idempotent to simplify user
            # experiences
            owner_id: int | None = None
            if owner := result.get("owner"):
                owner_id = owner.id

            try:
                with transaction.atomic(router.db_for_write(Release)):
                    release, created = (
                        Release.objects.create(
                            organization_id=project.organization_id,
                            version=result["version"],
                            ref=result.get("ref"),
                            url=result.get("url"),
                            owner_id=owner_id,
                            date_released=result.get("dateReleased"),
                            status=new_status or ReleaseStatus.OPEN,
                            user_agent=request.META.get("HTTP_USER_AGENT", ""),
                        ),
                        True,
                    )
                was_released = False
            except IntegrityError:
                release, created = (
                    Release.objects.get(
                        organization_id=project.organization_id, version=result["version"]
                    ),
                    False,
                )
                was_released = bool(release.date_released)
            else:
                release_created.send_robust(release=release, sender=self.__class__)

            if not created and new_status is not None and new_status != release.status:
                release.status = new_status
                release.save()

            _, releaseproject_created = release.add_project(project)

            commit_list = result.get("commits")
            if commit_list:
                hook = ReleaseHook(project)
                # TODO(dcramer): handle errors with release payloads
                hook.set_commits(release.version, commit_list)

            if not was_released and release.date_released:
                Activity.objects.create(
                    type=ActivityType.RELEASE.value,
                    project=project,
                    ident=Activity.get_version_ident(result["version"]),
                    data={"version": result["version"]},
                    datetime=release.date_released,
                )

            if not releaseproject_created:
                # This is the closest status code that makes sense, and we want
                # a unique 2xx response code so people can understand when
                # behavior differs.
                #   208 Already Reported (WebDAV; RFC 5842)
                status = 208
            else:
                status = 201

            analytics.record(
                ReleaseCreatedEvent(
                    user_id=request.user.id if request.user and request.user.id else None,
                    organization_id=project.organization_id,
                    project_ids=[project.id],
                    user_agent=request.META.get("HTTP_USER_AGENT", "")[:256],
                    created_status=status,
                    auth_type=get_auth_api_token_type(request.auth),
                )
            )

            if is_org_auth_token_auth(request.auth):
                update_org_auth_token_last_used(request.auth, [project.id])

            scope.set_tag("success_status", status)

            # Disable snuba here as it often causes 429s when overloaded and
            # a freshly created release won't have health data anyways.
            return Response(
                serialize(release, request.user, no_snuba_for_release_creation=True),
                status=status,
            )
        scope.set_tag("failure_reason", "serializer_error")
        return Response(serializer.errors, status=400)
