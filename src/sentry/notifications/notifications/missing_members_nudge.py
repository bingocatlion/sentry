from __future__ import annotations

from collections.abc import Iterable, Mapping, MutableMapping, Sequence
from typing import Any

from sentry.db.models.base import Model
from sentry.integrations.types import ExternalProviders, IntegrationProviderSlug
from sentry.models.organization import Organization
from sentry.notifications.notifications.base import BaseNotification
from sentry.notifications.notifications.strategies.member_write_role_recipient_strategy import (
    MemberWriteRoleRecipientStrategy,
)
from sentry.notifications.types import NotificationSettingEnum
from sentry.types.actor import Actor

PROVIDER_TO_URL = {IntegrationProviderSlug.GITHUB.value: "https://github.com/"}


class MissingMembersNudgeNotification(BaseNotification):
    metrics_key = "missing_members_nudge"
    analytics_event = "missing_members_nudge.sent"
    template_path = "sentry/emails/missing-members-nudge"

    RoleBasedRecipientStrategyClass = MemberWriteRoleRecipientStrategy
    notification_setting_type_enum = NotificationSettingEnum.APPROVAL

    def __init__(
        self,
        organization: Organization,
        commit_authors: Sequence[dict[str, Any]],
        provider: str,
    ) -> None:
        super().__init__(organization)
        for author in commit_authors:
            author["profile_link"] = PROVIDER_TO_URL[provider] + author["external_id"]
        self.commit_authors = commit_authors
        self.provider = provider
        self.role_based_recipient_strategy = self.RoleBasedRecipientStrategyClass(organization)

    @property
    def reference(self) -> Model | None:
        return None

    def get_subject(self, context: Mapping[str, Any] | None = None) -> str:
        return "Invite your developers to Sentry"

    def get_notification_providers(self) -> Iterable[ExternalProviders]:
        # only email
        return [ExternalProviders.EMAIL]

    def get_members_list_url(
        self, provider: ExternalProviders, recipient: Actor | None = None
    ) -> str:
        url = self.organization.absolute_url(
            f"/settings/{self.organization.slug}/members/",
            query=self.get_sentry_query_params(provider, recipient),
        )
        url += "&inviteMissingMembers=true"
        return url

    def get_context(self) -> MutableMapping[str, Any]:
        return {
            "organization": self.organization,
            "top_missing_members": self.commit_authors,
            "members_list_url": self.get_members_list_url(provider=ExternalProviders.EMAIL),
            "provider": self.provider.capitalize(),
        }

    def determine_recipients(self) -> list[Actor]:
        # owners and managers have org:write
        return Actor.many_from_object(self.role_based_recipient_strategy.determine_recipients())
