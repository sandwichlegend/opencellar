/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as bottles from "../bottles.js";
import type * as catalog from "../catalog.js";
import type * as cellar from "../cellar.js";
import type * as files from "../files.js";
import type * as imports from "../imports.js";
import type * as lib_bottleState from "../lib/bottleState.js";
import type * as lib_cellartracker from "../lib/cellartracker.js";
import type * as lib_domain from "../lib/domain.js";
import type * as lib_normalize from "../lib/normalize.js";
import type * as lib_similarity from "../lib/similarity.js";
import type * as locations from "../locations.js";
import type * as model_catalog from "../model/catalog.js";
import type * as model_ingest from "../model/ingest.js";
import type * as model_merge from "../model/merge.js";
import type * as model_search from "../model/search.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  bottles: typeof bottles;
  catalog: typeof catalog;
  cellar: typeof cellar;
  files: typeof files;
  imports: typeof imports;
  "lib/bottleState": typeof lib_bottleState;
  "lib/cellartracker": typeof lib_cellartracker;
  "lib/domain": typeof lib_domain;
  "lib/normalize": typeof lib_normalize;
  "lib/similarity": typeof lib_similarity;
  locations: typeof locations;
  "model/catalog": typeof model_catalog;
  "model/ingest": typeof model_ingest;
  "model/merge": typeof model_merge;
  "model/search": typeof model_search;
  validators: typeof validators;
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

export declare const components: {};
