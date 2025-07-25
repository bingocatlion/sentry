import type {DateTimeObject} from 'sentry/components/charts/utils';
import {getSeriesApiInterval} from 'sentry/components/charts/utils';
import {DATA_CATEGORY_INFO} from 'sentry/constants';
import {DataCategory} from 'sentry/types/core';
import {formatBytesBase10} from 'sentry/utils/bytes/formatBytesBase10';
import {parsePeriodToHours} from 'sentry/utils/duration/parsePeriodToHours';

const MILLION = 10 ** 6;
const BILLION = 10 ** 9;
const GIGABYTE = 10 ** 9;

type FormatOptions = {
  /**
   * Truncate 1234 => 1.2k or 1,234,000 to 1.23M
   */
  isAbbreviated?: boolean;

  /**
   * Convert attachments to use the most appropriate unit KB/MB/GB/TB/etc.
   * Otherwise, it will default to GB
   */
  useUnitScaling?: boolean;
};

/**
 * This expects usage values/quantities for the data categories that we sell.
 *
 * Note: usageQuantity for Attachments should be in BYTES
 */
export function formatUsageWithUnits(
  usageQuantity = 0,
  dataCategory: DataCategory,
  options: FormatOptions = {isAbbreviated: false, useUnitScaling: false}
): string {
  if (
    dataCategory === DATA_CATEGORY_INFO.attachment.plural ||
    dataCategory === DATA_CATEGORY_INFO.log_byte.plural
  ) {
    if (options.useUnitScaling) {
      return formatBytesBase10(usageQuantity);
    }

    const usageGb = usageQuantity / GIGABYTE;
    return options.isAbbreviated
      ? `${abbreviateUsageNumber(usageGb)} GB`
      : `${usageGb.toLocaleString(undefined, {maximumFractionDigits: 2})} GB`;
  }

  if (
    (dataCategory === DATA_CATEGORY_INFO.profile_duration.plural ||
      dataCategory === DATA_CATEGORY_INFO.profile_duration_ui.plural) &&
    Number.isFinite(usageQuantity)
  ) {
    // Profile duration is in milliseconds, convert to hours
    const hours = usageQuantity / 1000 / 60 / 60;
    return hours.toLocaleString(undefined, {
      maximumFractionDigits: hours < 0.01 ? 3 : 2,
    });
  }

  return options.isAbbreviated
    ? abbreviateUsageNumber(usageQuantity)
    : usageQuantity.toLocaleString();
}

/**
 * Good default for "formatUsageWithUnits"
 */
export function getFormatUsageOptions(dataCategory: DataCategory): FormatOptions {
  return {
    isAbbreviated:
      dataCategory !== DATA_CATEGORY_INFO.attachment.plural &&
      dataCategory !== DATA_CATEGORY_INFO.log_byte.plural,
    useUnitScaling:
      dataCategory === DATA_CATEGORY_INFO.attachment.plural ||
      dataCategory === DATA_CATEGORY_INFO.log_byte.plural,
  };
}

/**
 * Instead of using this function directly, use formatReservedWithUnits or
 * formatUsageWithUnits with options.isAbbreviated to true instead.
 *
 * This function display different precision for billion/million/thousand to
 * provide clarity on usage of errors/transactions/attachments to the user.
 *
 * If you are not displaying usage numbers, it might be better to use
 * `formatAbbreviatedNumber` in 'sentry/utils/formatters'
 */
function abbreviateUsageNumber(n: number) {
  if (n >= BILLION) {
    return (n / BILLION).toLocaleString(undefined, {maximumFractionDigits: 2}) + 'B';
  }

  if (n >= MILLION) {
    return (n / MILLION).toLocaleString(undefined, {maximumFractionDigits: 1}) + 'M';
  }

  if (n >= 1000) {
    return (n / 1000).toLocaleString(undefined, {maximumFractionDigits: 1}) + 'K';
  }

  // Do not show decimals
  return n.toFixed().toLocaleString();
}

/**
 * We want to display datetime in UTC in the following situations:
 *
 * 1) The user selected an absolute date range with UTC
 * 2) The user selected a wide date range with 1d interval
 *
 * When the interval is 1d, we need to use UTC because the 24 hour range might
 * shift forward/backward depending on the user's timezone, or it might be
 * displayed as a day earlier/later
 */
export function isDisplayUtc(datetime: DateTimeObject): boolean {
  if (datetime.utc) {
    return true;
  }

  const interval = getSeriesApiInterval(datetime);
  const hours = parsePeriodToHours(interval);
  return hours >= 24;
}

/**
 * HACK(dlee): client-side pagination
 */
export function getOffsetFromCursor(cursor?: string) {
  const offset = Number(cursor?.split(':')[1]);
  return isNaN(offset) ? 0 : offset;
}

/**
 * HACK(dlee): client-side pagination
 */
export function getPaginationPageLink({
  numRows,
  pageSize,
  offset,
}: {
  numRows: number;
  offset: number;
  pageSize: number;
}) {
  const prevOffset = offset - pageSize;
  const nextOffset = offset + pageSize;

  return `<link>; rel="previous"; results="${prevOffset >= 0}"; cursor="0:${Math.max(
    0,
    prevOffset
  )}:1", <link>; rel="next"; results="${
    nextOffset < numRows
  }"; cursor="0:${nextOffset}:0"`;
}

export function isContinuousProfiling(dataCategory: DataCategory | string) {
  return (
    dataCategory === DataCategory.PROFILE_DURATION ||
    dataCategory === DataCategory.PROFILE_DURATION_UI
  );
}
