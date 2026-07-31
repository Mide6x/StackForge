// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { renderMockMvcTest } from "./testing.js";

for (const database of [false, true]) {
  test(`renders compilable MockMvc import ordering with database=${database}`, () => {
    const source = renderMockMvcTest(database);
    const finalImport = source.lastIndexOf("import ");
    const firstAnnotation = source.indexOf(database ? "@WebMvcTest" : "@SpringBootTest");

    assert.ok(finalImport >= 0);
    assert.ok(firstAnnotation > finalImport);
    assert.equal(
      source.match(/import static org\.springframework\.test\.web\.servlet\.request\.MockMvcRequestBuilders\.get;/g)?.length,
      1,
    );
  });
}
