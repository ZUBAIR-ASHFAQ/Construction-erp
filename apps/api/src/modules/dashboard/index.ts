export {
  DASHBOARD_API_BASE,
  DASHBOARD_ERROR_CODES,
  DASHBOARD_MAX_DATE_RANGE_DAYS,
  DASHBOARD_MAX_PAGE_SIZE,
  DASHBOARD_PERMISSION_CODES,
  DASHBOARD_SERVER_OWNED_REQUEST_FIELDS,
  DASHBOARD_WIDGET_CODES,
  createDashboardError,
  dashboardAlertsQuerySchema,
  dashboardPreferenceFiltersSchema,
  dashboardProjectParamsSchema,
  dashboardProjectQuerySchema,
  dashboardProjectsQuerySchema,
  dashboardSummaryQuerySchema,
  updateDashboardPreferencesBodySchema
} from './dashboard.schema.js';
export type {
  DashboardAlertsQuery,
  DashboardErrorCode,
  DashboardHttpMethod,
  DashboardPermissionCode,
  DashboardPreferenceFilters,
  DashboardProjectParams,
  DashboardProjectQuery,
  DashboardProjectsQuery,
  DashboardRouteDefinition,
  DashboardSummaryQuery,
  DashboardWidgetCode,
  UpdateDashboardPreferencesBody
} from './dashboard.schema.js';

export { DASHBOARD_HTTP_ROUTES, registerDashboardRoutes } from './dashboard.routes.js';
export type { DashboardRoutesOptions } from './dashboard.routes.js';
export { DashboardRepository } from './dashboard.repository.js';
export type {
  DashboardPreferenceLayoutJson,
  DashboardPreferenceRepositoryInput,
  DashboardProjectListRepositoryInput,
  DashboardRepositoryVisibility
} from './dashboard.repository.js';
export { DashboardService } from './dashboard.service.js';
export type { DashboardServiceScope } from './dashboard.service.js';
