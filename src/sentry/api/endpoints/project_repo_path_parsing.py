from pathlib import PurePath, PureWindowsPath
from typing import Any
from urllib.parse import urlparse

from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from sentry.api.api_publish_status import ApiPublishStatus
from sentry.api.base import region_silo_endpoint
from sentry.api.bases.project import ProjectEndpoint, ProjectPermission
from sentry.api.serializers.rest_framework.base import CamelSnakeSerializer
from sentry.integrations.base import IntegrationFeatures
from sentry.integrations.manager import default_manager as integrations
from sentry.integrations.services.integration import RpcIntegration, integration_service
from sentry.integrations.source_code_management.repository import RepositoryIntegration
from sentry.issues.auto_source_code_config.code_mapping import find_roots
from sentry.issues.auto_source_code_config.frame_info import FrameInfo, create_frame_info
from sentry.models.project import Project
from sentry.models.repository import Repository


class PathMappingSerializer(CamelSnakeSerializer[dict[str, str]]):
    stack_path = serializers.CharField()
    source_url = serializers.URLField()

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.integration: RpcIntegration | None = None
        self.repo: Repository | None = None

    @property
    def providers(self) -> list[str]:
        return [
            x.key for x in integrations.all() if x.has_feature(IntegrationFeatures.STACKTRACE_LINK)
        ]

    @property
    def org_id(self) -> int:
        return self.context["organization_id"]

    def validate_source_url(self, source_url: str) -> str:
        # first check to see if we are even looking at the same file
        stack_path = self.initial_data["stack_path"]

        stack_file = PureWindowsPath(stack_path).name
        source_file = PurePath(urlparse(source_url).path).name

        if stack_file != source_file:
            raise serializers.ValidationError(
                "Source code URL points to a different file than the stack trace"
            )

        def integration_match(integration: RpcIntegration) -> bool:
            installation = integration.get_installation(self.org_id)
            # Check if the installation has the source_url_matches method
            if isinstance(installation, RepositoryIntegration):
                return installation.source_url_matches(source_url)
            # Fallback to a basic check if the method doesn't exist
            return False

        def repo_match(repo: Repository) -> bool:
            return repo.url is not None and source_url.startswith(repo.url)

        # now find the matching integration
        integrations = integration_service.get_integrations(
            organization_id=self.org_id, providers=self.providers
        )

        matching_integrations = list(filter(integration_match, integrations))
        if not matching_integrations:
            raise serializers.ValidationError("Could not find integration")

        self.integration = matching_integrations[0]

        # now find the matching repo
        repos = Repository.objects.filter(
            organization_id=self.org_id, integration_id=self.integration.id, url__isnull=False
        )
        matching_repos = list(filter(repo_match, repos))
        if not matching_repos:
            raise serializers.ValidationError("Could not find repo")

        # store the repo we found
        self.repo = matching_repos[0]
        return source_url


class ProjectRepoPathParsingEndpointLoosePermission(ProjectPermission):
    """
    Similar to the code_mappings endpoint, loosen permissions to all users
    """

    scope_map = {
        "POST": ["org:read", "project:write", "project:admin"],
    }


@region_silo_endpoint
class ProjectRepoPathParsingEndpoint(ProjectEndpoint):
    publish_status = {
        "POST": ApiPublishStatus.UNKNOWN,
    }
    permission_classes = (ProjectRepoPathParsingEndpointLoosePermission,)
    """
    Returns the parameters associated with the RepositoryProjectPathConfig
    we would create based on a particular stack trace and source code URL.
    Does validation to make sure we have an integration and repo
    depending on the source code URL
    """

    def post(self, request: Request, project: Project) -> Response:
        serializer = PathMappingSerializer(
            context={"organization_id": project.organization_id},
            data=request.data,
        )
        if not serializer.is_valid():
            return self.respond(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        source_url = data["source_url"]
        frame_info = get_frame_info_from_request(request)

        # validated by `serializer.is_valid()`
        assert serializer.repo is not None
        assert serializer.integration is not None
        repo = serializer.repo
        integration = serializer.integration
        installation = integration.get_installation(project.organization_id)

        if not isinstance(installation, RepositoryIntegration):
            return self.respond(
                {"detail": "Integration does not support repository operations"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        branch = installation.extract_branch_from_source_url(repo, source_url)
        source_path = installation.extract_source_path_from_source_url(repo, source_url)
        stack_root, source_root = find_roots(frame_info, source_path)

        return self.respond(
            {
                "integrationId": integration.id,
                "repositoryId": repo.id,
                "provider": integration.provider,
                "stackRoot": stack_root,
                "sourceRoot": source_root,
                "defaultBranch": branch,
            }
        )


def get_frame_info_from_request(request: Request) -> FrameInfo:
    frame = {
        "abs_path": request.data.get("absPath"),
        "filename": request.data["stackPath"],
        "module": request.data.get("module"),
    }
    return create_frame_info(frame, request.data.get("platform"))
