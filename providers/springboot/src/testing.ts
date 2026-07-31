import type { ProviderTestingSupport, TestingGenerationContext } from "@stackforge/core";
import { targetDirectory } from "@stackforge/core";

const mockMvcOption = {
  id: "junit-mockmvc",
  name: "JUnit 5 + MockMvc",
  description: "Application and HTTP health endpoint tests without a production server.",
  testTypes: ["unit", "integration"] as const,
  commands: [{ name: "JUnit and MockMvc tests", command: ["mvn", "test"] }],
  default: true,
};
const testcontainersOption = {
  id: "testcontainers",
  name: "Testcontainers",
  description: "Database-aware integration testing with disposable containers.",
  testTypes: ["integration"] as const,
  commands: [{ name: "Database integration tests", command: ["mvn", "test"], requires: ["Docker must be running for Testcontainers."] }],
  isAvailable(selection: { providerIds: string[] }) {
    return selection.providerIds.includes("postgres") || selection.providerIds.includes("mongodb");
  },
};
function prefix(context: TestingGenerationContext): string { return context.selection.projectType === "full-stack" ? `${context.directories.backend ?? "backend"}/` : ""; }
function hasDatabase(context: TestingGenerationContext): boolean { return context.selection.providerIds.some((id) => id === "postgres" || id === "mongodb" || id === "supabase"); }
async function mockMvc(context: TestingGenerationContext): Promise<void> {
  const root = prefix(context); const database = hasDatabase(context);
  context.dependencies.add({ manager: "maven", target: "backend", groupId: "org.springframework.boot", artifactId: "spring-boot-starter-test", scope: "test" });
  const annotations = database
    ? `import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import static org.mockito.Mockito.doNothing;

@WebMvcTest(HealthController.class)`
    : `import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
@AutoConfigureMockMvc`;
  await context.files.create(`${root}src/test/java/com/stackforge/backend/HealthControllerTest.java`, `package com.stackforge.backend;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
${annotations}

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class HealthControllerTest {
  @Autowired
  private MockMvc mockMvc;
${database ? "\n  @MockBean\n  private DatabaseHealth database;\n" : ""}
  @Test
  void healthReturnsOk() throws Exception {
${database ? "    doNothing().when(database).check();\n" : ""}    mockMvc.perform(get("/health"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ok"));
  }
}
`);
  context.result.addTestSuite({ providerId: "springboot", component: "backend", optionId: mockMvcOption.id, name: mockMvcOption.name, directory: targetDirectory(context, "backend"), commands: mockMvcOption.commands });
}
async function testcontainers(context: TestingGenerationContext): Promise<void> {
  const root = prefix(context); const postgres = context.selection.providerIds.includes("postgres");
  context.dependencies.add({ manager: "maven", target: "backend", groupId: "org.testcontainers", artifactId: "junit-jupiter", version: "1.21.3", scope: "test" });
  context.dependencies.add({ manager: "maven", target: "backend", groupId: "org.testcontainers", artifactId: postgres ? "postgresql" : "mongodb", version: "1.21.3", scope: "test" });
  const containerType = postgres ? "PostgreSQLContainer<?>" : "MongoDBContainer";
  const container = postgres ? 'new PostgreSQLContainer<>("postgres:16-alpine")' : 'new MongoDBContainer("mongo:8")';
  const importValue = postgres ? "org.testcontainers.containers.PostgreSQLContainer" : "org.testcontainers.containers.MongoDBContainer";
  await context.files.create(`${root}src/test/java/com/stackforge/backend/DatabaseContainerTest.java`, `package com.stackforge.backend;

import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import ${importValue};

import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers
class DatabaseContainerTest {
  @Container
  static final ${containerType} database = ${container};

  @Test
  void databaseContainerStarts() {
    assertTrue(database.isRunning());
  }
}
`);
  context.result.addTestSuite({ providerId: "springboot", component: "backend", optionId: testcontainersOption.id, name: testcontainersOption.name, directory: targetDirectory(context, "backend"), commands: testcontainersOption.commands });
}
export const testing: ProviderTestingSupport = { options: [mockMvcOption, testcontainersOption], generators: [{ optionId: mockMvcOption.id, generate: mockMvc }, { optionId: testcontainersOption.id, generate: testcontainers }] };
