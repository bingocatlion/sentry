from uuid import uuid4

import pytest

from sentry import nodestore
from sentry.deletions.tasks.groups import delete_groups
from sentry.eventstore.models import Event
from sentry.exceptions import DeleteAborted
from sentry.models.group import Group, GroupStatus
from sentry.models.groupassignee import GroupAssignee
from sentry.models.grouphash import GroupHash
from sentry.models.grouphashmetadata import GroupHashMetadata
from sentry.models.groupmeta import GroupMeta
from sentry.models.groupredirect import GroupRedirect
from sentry.testutils.cases import TestCase
from sentry.testutils.helpers.datetime import before_now
from sentry.testutils.skips import requires_snuba

pytestmark = [requires_snuba]


class DeleteGroupTest(TestCase):
    def test_simple(self) -> None:
        event_id = "a" * 32
        event_id_2 = "b" * 32
        project = self.create_project()

        node_id = Event.generate_node_id(project.id, event_id)
        node_id_2 = Event.generate_node_id(project.id, event_id_2)

        event = self.store_event(
            data={
                "event_id": event_id,
                "timestamp": before_now(minutes=1).isoformat(),
                "fingerprint": ["group1"],
            },
            project_id=project.id,
        )

        self.store_event(
            data={
                "event_id": event_id_2,
                "timestamp": before_now(minutes=1).isoformat(),
                "fingerprint": ["group1"],
            },
            project_id=project.id,
        )

        assert event.group is not None
        group = event.group
        group.update(status=GroupStatus.PENDING_DELETION, substatus=None)

        GroupAssignee.objects.create(group=group, project=project, user_id=self.user.id)
        grouphash = GroupHash.objects.create(project=project, group=group, hash=uuid4().hex)
        GroupHashMetadata.objects.create(grouphash=grouphash)
        GroupMeta.objects.create(group=group, key="foo", value="bar")
        GroupRedirect.objects.create(group_id=group.id, previous_group_id=1)

        assert nodestore.backend.get(node_id)
        assert nodestore.backend.get(node_id_2)

        with self.tasks():
            delete_groups(object_ids=[group.id])

        assert not GroupRedirect.objects.filter(group_id=group.id).exists()
        assert not GroupHash.objects.filter(group_id=group.id).exists()
        assert not GroupHashMetadata.objects.filter(grouphash_id=grouphash.id).exists()
        assert not Group.objects.filter(id=group.id).exists()
        assert not nodestore.backend.get(node_id)
        assert not nodestore.backend.get(node_id_2)

    def test_first_group_not_found(self) -> None:
        group = self.create_group()
        group2 = self.create_group()
        group_ids = [group.id, group2.id]
        group.delete()

        with self.tasks():
            delete_groups(object_ids=group_ids)

        assert Group.objects.count() == 0

    def test_no_first_group_found(self) -> None:
        group = self.create_group()
        group_ids = [group.id]
        group.delete()

        with self.tasks(), pytest.raises(DeleteAborted):
            delete_groups(object_ids=group_ids)
