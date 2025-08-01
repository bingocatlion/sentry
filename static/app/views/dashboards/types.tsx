import type {Layout} from 'react-grid-layout';

import {t} from 'sentry/locale';
import type {User} from 'sentry/types/user';
import {type DatasetSource, SavedQueryDatasets} from 'sentry/utils/discover/types';

import type {ThresholdsConfig} from './widgetBuilder/buildSteps/thresholdsStep/thresholdsStep';

// Max widgets per dashboard we are currently willing
// to allow to limit the load on snuba from the
// parallel requests. Somewhat arbitrary
// limit that can be changed if necessary.
export const MAX_WIDGETS = 30;

export const DEFAULT_TABLE_LIMIT = 5;

export const DEFAULT_WIDGET_NAME = t('Custom Widget');

export enum DisplayType {
  AREA = 'area',
  BAR = 'bar',
  LINE = 'line',
  TABLE = 'table',
  BIG_NUMBER = 'big_number',
  TOP_N = 'top_n',
}

export enum WidgetType {
  DISCOVER = 'discover',
  ISSUE = 'issue',
  RELEASE = 'metrics', // TODO(metrics): rename RELEASE to 'release', and METRICS to 'metrics'
  METRICS = 'custom-metrics',
  ERRORS = 'error-events',
  TRANSACTIONS = 'transaction-like',
  SPANS = 'spans',
  LOGS = 'logs',
}

// These only pertain to on-demand warnings at this point in time
// Since they are the only soft-validation we do.
type WidgetWarning = Record<string, OnDemandExtractionState>;
type WidgetQueryWarning = null | OnDemandExtractionState;

export interface ValidateWidgetResponse {
  warnings: {
    columns: WidgetWarning;
    queries: WidgetQueryWarning[]; // Ordered, matching queries passed via the widget.
  };
}

export enum OnDemandExtractionState {
  DISABLED_NOT_APPLICABLE = 'disabled:not-applicable',
  DISABLED_PREROLLOUT = 'disabled:pre-rollout',
  DISABLED_MANUAL = 'disabled:manual',
  DISABLED_SPEC_LIMIT = 'disabled:spec-limit',
  DISABLED_HIGH_CARDINALITY = 'disabled:high-cardinality',
  ENABLED_ENROLLED = 'enabled:enrolled',
  ENABLED_MANUAL = 'enabled:manual',
  ENABLED_CREATION = 'enabled:creation',
}

export const WIDGET_TYPE_TO_SAVED_QUERY_DATASET = {
  [WidgetType.ERRORS]: SavedQueryDatasets.ERRORS,
  [WidgetType.TRANSACTIONS]: SavedQueryDatasets.TRANSACTIONS,
};

interface WidgetQueryOnDemand {
  enabled: boolean;
  extractionState: OnDemandExtractionState;
}

/**
 * A widget query is one or more aggregates and a single filter string (conditions.)
 * Widgets can have multiple widget queries, and they all combine into a unified timeseries view (for example)
 */
export type WidgetQuery = {
  aggregates: string[];
  columns: string[];
  conditions: string;
  name: string;
  orderby: string;
  // Table column alias.
  // We may want to have alias for y-axis in the future too
  fieldAliases?: string[];
  // Fields is replaced with aggregates + columns. It
  // is currently used to track column order on table
  // widgets.
  fields?: string[];
  isHidden?: boolean | null;
  // Contains the on-demand entries for the widget query.
  onDemand?: WidgetQueryOnDemand[];
  // Aggregate selected for the Big Number widget builder
  selectedAggregate?: number;
};

export type Widget = {
  displayType: DisplayType;
  interval: string;
  queries: WidgetQuery[];
  title: string;
  dashboardId?: string;
  datasetSource?: DatasetSource;
  description?: string;
  id?: string;
  layout?: WidgetLayout | null;
  // Used to define 'topEvents' when fetching time-series data for a widget
  limit?: number;
  // Used for table widget column widths, currently is not saved
  tableWidths?: number[];
  tempId?: string;
  thresholds?: ThresholdsConfig | null;
  widgetType?: WidgetType;
};

// We store an explicit set of keys in the backend now
export type WidgetLayout = Pick<Layout, 'h' | 'w' | 'x' | 'y'> & {
  minH: number;
};

export type WidgetPreview = {
  displayType: DisplayType;
  layout: WidgetLayout | null;
};

export type DashboardPermissions = {
  isEditableByEveryone: boolean;
  teamsWithEditAccess?: number[];
};

/**
 * The response shape from dashboard list endpoint
 */
export type DashboardListItem = {
  environment: string[];
  filters: DashboardFilters;
  id: string;
  projects: number[];
  title: string;
  widgetDisplay: DisplayType[];
  widgetPreview: WidgetPreview[];
  createdBy?: User;
  dateCreated?: string;
  isFavorited?: boolean;
  lastVisited?: string;
  permissions?: DashboardPermissions;
};

export enum DashboardFilterKeys {
  RELEASE = 'release',
}

export type DashboardFilters = {
  [DashboardFilterKeys.RELEASE]?: string[];
};

/**
 * Saved dashboard with widgets
 */
export type DashboardDetails = {
  dateCreated: string;
  filters: DashboardFilters;
  id: string;
  projects: undefined | number[];
  title: string;
  widgets: Widget[];
  createdBy?: User;
  end?: string;
  environment?: string[];
  isFavorited?: boolean;
  period?: string;
  permissions?: DashboardPermissions;
  start?: string;
  utc?: boolean;
};

export enum DashboardState {
  VIEW = 'view',
  EDIT = 'edit',
  INLINE_EDIT = 'inline_edit',
  CREATE = 'create',
  PENDING_DELETE = 'pending_delete',
  PREVIEW = 'preview',
}

// where we launch the dashboard widget from
export enum DashboardWidgetSource {
  DISCOVERV2 = 'discoverv2',
  DASHBOARDS = 'dashboards',
  LIBRARY = 'library',
  ISSUE_DETAILS = 'issueDetail',
  TRACE_EXPLORER = 'traceExplorer',
}
