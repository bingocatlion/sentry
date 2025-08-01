from sentry.grouping.strategies.base import (
    RISK_LEVEL_HIGH,
    StrategyConfiguration,
    create_strategy_configuration_class,
)

# The full mapping of all known configurations.
CONFIGURATIONS: dict[str, type[StrategyConfiguration]] = {}

# The implied base strategy *every* strategy inherits from if no
# base is defined.
BASE_STRATEGY = create_strategy_configuration_class(
    None,
    # Strategy priority is enforced programaticaly via the `score` argument to the `@strategy`
    # decorator (rather than by the order they're listed here), but they are nonetheless listed here
    # from highest to lowest priority for documentation purposes. The first strategy to produce a
    # result will become the winner.
    strategies=[
        "chained-exception:v1",  # This handles single exceptions, too
        "threads:v1",
        "stacktrace:v1",
        "template:v1",
        "csp:v1",
        "hpkp:v1",
        "expect-staple:v1",
        "expect-ct:v1",
        "message:v1",
    ],
    delegates=["frame:v1", "stacktrace:v1", "single-exception:v1"],
    initial_context={
        # This key in the context tells the system which variant should
        # be produced.  TODO: phase this out.
        "variant": None,
        # This is a flag that can be used by any delegate to respond to
        # a detected recursion.  This is currently used by the frame
        # strategy to disable itself.  Recursion is detected by the outer
        # strategy.
        "is_recursion": False,
        # This turns on the automatic message trimming and parameter substitution
        # by the message strategy. (Only still configurable so it can be turned off in tests.)
        "normalize_message": True,
        # Turns on some javascript fuzzing features.
        "javascript_fuzzing": True,
        # Platforms for which context line should be taken into
        # account when grouping.
        "contextline_platforms": ("javascript", "node", "python", "php", "ruby"),
        # This detects anonymous classes in PHP code.
        "php_detect_anonymous_classes": False,
        # Turns on a bug that was present in some variants
        "with_context_line_file_origin_bug": True,
        # Turns on falling back to exception values when there
        # is no stacktrace.
        "with_exception_value_fallback": True,
        # Stacktrace is produced in the context of this exception
        "exception_data": None,
        # replaces generated IDs in Java stack frames related to CGLIB and hibernate
        "java_cglib_hibernate_logic": False,
    },
)


def register_strategy_config(id: str, **kwargs) -> type[StrategyConfiguration]:
    if kwargs.get("base") is not None:
        kwargs["base"] = CONFIGURATIONS[kwargs["base"]]
    else:
        kwargs["base"] = BASE_STRATEGY
    strategy_class = create_strategy_configuration_class(id, **kwargs)
    CONFIGURATIONS[id] = strategy_class
    return strategy_class


# Simple newstyle grouping
#
# This is a grouping strategy that applies very simple rules and will
# become the new default at one point.  Optimized for native and
# javascript but works for all platforms.
register_strategy_config(
    id="newstyle:2019-05-08",
    risk=RISK_LEVEL_HIGH,
    changelog="""
        * Uses source code information all platforms with reliable sources
          for grouping (JavaScript, Python, PHP and Ruby) and function
          names and filenames otherwise.
        * Fallback grouping applies clean-up logic on exception messages
          (numbers, uuids, email addresses and others are removed)
        * JavaScript stacktraces are better deduplicated across browser
          versions yielding a higher chance of these grouping together.
        * JavaScript stacktraces involving source maps are likely to group
          better.
        * C/C++ and other native stacktraces are more reliably grouped.
    """,
    initial_context={},
    enhancements_base="common:2019-03-23",
)

# This is the grouping strategy used for new projects.
register_strategy_config(
    id="newstyle:2023-01-11",
    base="newstyle:2019-05-08",
    risk=RISK_LEVEL_HIGH,
    changelog="""
        * Better rules for when to take context lines into account for
          JavaScript platforms for grouping purposes.
        * Better support for PHP7 anonymous classes.
        * Added new language/platform specific stack trace grouping enhancements rules
          that should make the default grouping experience better.
          This includes JavaScript, Python, PHP, Go, Java and Kotlin.
        * Added ChukloadErrors via new built-in fingerprinting support.
    """,
    initial_context={
        "php_detect_anonymous_classes": True,
        "with_context_line_file_origin_bug": False,
        "java_cglib_hibernate_logic": True,
    },
    enhancements_base="newstyle:2023-01-11",
    fingerprinting_bases=["javascript@2024-02-02"],
)
