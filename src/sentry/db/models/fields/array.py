"""DO NOT USE ME. USE django.contrib.postgres.fields.array.ArrayField

I am only here for migration compatibility
"""

from __future__ import annotations

import ast

from django.db import models

from sentry.db.models.utils import Creator
from sentry.utils import json


# Adapted from django-pgfields
# https://github.com/lukesneeringer/django-pgfields/blob/master/django_pg/models/fields/array.py
class ArrayField(models.Field):
    def __init__(self, of=models.TextField, **kwargs):
        # Arrays in PostgreSQL are arrays of a particular type.
        # Save the subtype in our field class.
        if isinstance(of, type):
            of = of()
        self.of = of

        # Set "null" to True. Arrays don't have nulls, but null=True
        # in the ORM amounts to nothing in SQL (whereas null=False
        # corresponds to `NOT NULL`)
        kwargs["null"] = True

        super().__init__(**kwargs)

    def contribute_to_class(self, cls: type[models.Model], name: str, private_only: bool = False):
        """
        Add a descriptor for backwards compatibility
        with previous Django behavior.
        """
        super().contribute_to_class(cls, name, private_only=private_only)
        setattr(cls, name, Creator(self))

    def db_type(self, connection):
        return f"{self.of.db_type(connection)}[]"

    def get_internal_type(self):
        return "TextField"

    def get_prep_value(self, value):
        """Iterate over each item in the array, and run it
        through the `get_prep_value` of this array's type.
        """
        # If no valid value was given, return an empty list.
        if not value:
            return []

        # Appropriately coerce each individual value within
        # our array.
        return [self.of.get_prep_value(item) for item in value]

    def to_python(self, value):
        if not value:
            value = []
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                # This is to accommodate the erroneous exports pre 21.4.0
                # See getsentry/sentry#23843 for more details
                try:
                    value = ast.literal_eval(value)
                except ValueError:
                    # this handles old database values using postgresql array format
                    # see https://sentry.sentry.io/issues/4524783782/
                    assert value[0] == "{" and value[-1] == "}", "Unexpected ArrayField format"
                    assert "\\" not in value, "Unexpected ArrayField format"
                    value = value[1:-1].split(",")
        return [self.of.to_python(x) for x in value]
