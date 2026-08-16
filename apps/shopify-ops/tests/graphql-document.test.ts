import assert from "node:assert/strict";
import test from "node:test";

import {
  getOperationKind,
  getOperationName,
} from "../src/graphql-document.ts";

test("identifies explicit and shorthand query operations", () => {
  assert.equal(getOperationKind("query Products { products { id } }"), "query");
  assert.equal(getOperationKind("{ shop { name } }"), "query");
});

test("identifies mutations after comments", () => {
  assert.equal(
    getOperationKind("# update a product\nmutation UpdateProduct { shop { id } }"),
    "mutation",
  );
  assert.equal(getOperationName("mutation UpdateProduct { shop { id } }"), "UpdateProduct");
});

test("rejects fragment-only documents as executable operations", () => {
  assert.equal(getOperationKind("fragment ProductFields on Product { id }"), null);
});
