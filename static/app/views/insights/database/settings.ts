import {
  FORTY_EIGHT_HOURS,
  GranularityLadder,
  ONE_HOUR,
  SIX_HOURS,
  SIXTY_DAYS,
  THIRTY_DAYS,
  TWENTY_FOUR_HOURS,
  TWO_WEEKS,
} from 'sentry/components/charts/utils';
import {t} from 'sentry/locale';
import {
  type Aggregate,
  type EAPSpanProperty,
  ModuleName,
} from 'sentry/views/insights/types';

export const MODULE_TITLE = t('Queries');
export const DATA_TYPE = t('Query');
export const DATA_TYPE_PLURAL = t('Queries');
export const BASE_URL = 'database';

export const EXCLUDED_DB_OPS = ['db.sql.room', 'db.redis'];

export const BASE_FILTERS = {
  'span.category': ModuleName.DB,
  '!span.op': `[${EXCLUDED_DB_OPS.join(',')}]`,
  has: 'sentry.normalized_description',
};

export const MIN_SDK_VERSION_BY_PLATFORM: Record<string, string> = {
  'sentry.python': '1.29.2',
  'sentry.javascript': '7.63.0',
  'sentry.laravel': '3.8.0',
  'sentry.cocoa': '8.11.0',
  'sentry.java': '6.29.0',
  'sentry.ruby': '5.11.0',
  'sentry.dotnet': '3.39.0',
  'sentry.symfony': '4.11.0',
  'sentry.android': '6.30.0',
};

export const DEFAULT_DURATION_AGGREGATE: Aggregate = 'avg';

export const CHART_HEIGHT = 160;

export const COUNTER_GRANULARITIES = new GranularityLadder([
  [SIXTY_DAYS, '1d'],
  [THIRTY_DAYS, '12h'],
  [TWO_WEEKS, '4h'],
  [TWENTY_FOUR_HOURS, '30m'],
  [SIX_HOURS, '5m'],
  [ONE_HOUR, '1m'],
  [0, '1m'],
]);

export const DISTRIBUTION_GRANULARITIES = new GranularityLadder([
  [TWO_WEEKS, '1d'],
  [FORTY_EIGHT_HOURS, '1h'],
  [TWENTY_FOUR_HOURS, '30m'],
  [SIX_HOURS, '5m'],
  [ONE_HOUR, '1m'],
  [0, '1m'],
]);

export const MODULE_DOC_LINK = 'https://docs.sentry.io/product/insights/backend/queries/';

export const MODULE_FEATURES = ['insights-initial-modules'];

export const FIELD_ALIASES = {
  'epm()': t('Queries Per Minute'),
} satisfies Partial<Record<EAPSpanProperty, string>>;
