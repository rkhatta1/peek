/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessGate from "../accessGate.js";
import type * as agentApi from "../agentApi.js";
import type * as agentApiActions from "../agentApiActions.js";
import type * as agentApiHttp from "../agentApiHttp.js";
import type * as agentApiInternal from "../agentApiInternal.js";
import type * as agentCommitActions from "../agentCommitActions.js";
import type * as agentCommitInternal from "../agentCommitInternal.js";
import type * as agentCommits from "../agentCommits.js";
import type * as auth from "../auth.js";
import type * as checkTriggers from "../checkTriggers.js";
import type * as cleanup from "../cleanup.js";
import type * as clients from "../clients.js";
import type * as codeConnectionActions from "../codeConnectionActions.js";
import type * as codeConnectionInternal from "../codeConnectionInternal.js";
import type * as codeConnections from "../codeConnections.js";
import type * as collectorInternal from "../collectorInternal.js";
import type * as collectors from "../collectors.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as ledgerTotals from "../ledgerTotals.js";
import type * as lib_accessGateCrypto from "../lib/accessGateCrypto.js";
import type * as lib_agentApi from "../lib/agentApi.js";
import type * as lib_checkTriggers from "../lib/checkTriggers.js";
import type * as lib_codeAttribution from "../lib/codeAttribution.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_ledgerTotals from "../lib/ledgerTotals.js";
import type * as lib_monitoring from "../lib/monitoring.js";
import type * as lib_pagination from "../lib/pagination.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_secrets from "../lib/secrets.js";
import type * as lib_validators from "../lib/validators.js";
import type * as monitoring from "../monitoring.js";
import type * as projects from "../projects.js";
import type * as serviceActions from "../serviceActions.js";
import type * as serviceInternal from "../serviceInternal.js";
import type * as services from "../services.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessGate: typeof accessGate;
  agentApi: typeof agentApi;
  agentApiActions: typeof agentApiActions;
  agentApiHttp: typeof agentApiHttp;
  agentApiInternal: typeof agentApiInternal;
  agentCommitActions: typeof agentCommitActions;
  agentCommitInternal: typeof agentCommitInternal;
  agentCommits: typeof agentCommits;
  auth: typeof auth;
  checkTriggers: typeof checkTriggers;
  cleanup: typeof cleanup;
  clients: typeof clients;
  codeConnectionActions: typeof codeConnectionActions;
  codeConnectionInternal: typeof codeConnectionInternal;
  codeConnections: typeof codeConnections;
  collectorInternal: typeof collectorInternal;
  collectors: typeof collectors;
  crons: typeof crons;
  http: typeof http;
  ledgerTotals: typeof ledgerTotals;
  "lib/accessGateCrypto": typeof lib_accessGateCrypto;
  "lib/agentApi": typeof lib_agentApi;
  "lib/checkTriggers": typeof lib_checkTriggers;
  "lib/codeAttribution": typeof lib_codeAttribution;
  "lib/domain": typeof lib_domain;
  "lib/ledgerTotals": typeof lib_ledgerTotals;
  "lib/monitoring": typeof lib_monitoring;
  "lib/pagination": typeof lib_pagination;
  "lib/providers": typeof lib_providers;
  "lib/secrets": typeof lib_secrets;
  "lib/validators": typeof lib_validators;
  monitoring: typeof monitoring;
  projects: typeof projects;
  serviceActions: typeof serviceActions;
  serviceInternal: typeof serviceInternal;
  services: typeof services;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
