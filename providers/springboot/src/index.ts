import type { StackForgeProvider } from "@stackforge/core";
import { targetDirectory, writeText } from "@stackforge/core";
import { testing } from "./testing.js";

const provider: StackForgeProvider = {
  metadata: {
    id: "springboot",
    name: "Spring Boot",
    category: "backend",
    description: "Production-ready Java application framework",
    version: "3.4",
    supportedLanguages: ["java"],
    tags: ["java", "api"],
    runtime: {
      developmentCommand: ["mvn spring-boot:run"],
      productionCommand: ["mvn package", "java -jar target/*.jar"],
      localUrl: "http://localhost:8080",
      healthCheckUrl: "http://localhost:8080/health",
      installCommand: ["mvn dependency:resolve"],
      dependenciesInstalled: false,
      notes: ["This MVP generates a Maven project without a Maven wrapper yet."],
    },
  },
  compatibility: { projectTypes: ["full-stack", "backend-only"] },
  generator: { async generate(context) {
    const target = targetDirectory(context, "backend");
    await Promise.all([
      writeText(target, "pom.xml", '<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd"><modelVersion>4.0.0</modelVersion><parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId><version>3.4.0</version></parent><groupId>com.stackforge</groupId><artifactId>backend</artifactId><version>0.0.1-SNAPSHOT</version><properties><java.version>21</java.version></properties><dependencies><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency><dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency></dependencies><build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build></project>\n'),
      writeText(target, "src/main/java/com/stackforge/backend/Application.java", 'package com.stackforge.backend;\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\nimport org.springframework.web.bind.annotation.GetMapping;\nimport org.springframework.web.bind.annotation.RestController;\n\n@SpringBootApplication\npublic class Application { public static void main(String[] args) { SpringApplication.run(Application.class, args); } }\n\n@RestController\nclass HealthController { @GetMapping("/health") java.util.Map<String, String> health() { return java.util.Map.of("status", "ok"); } }\n'),
      writeText(target, "src/main/resources/application.properties", "spring.application.name=backend\n"),
    ]);
    if (context.selection.docker) await writeText(target, "Dockerfile", "FROM maven:3.9-eclipse-temurin-21 AS build\nWORKDIR /app\nCOPY pom.xml .\nRUN mvn dependency:go-offline\nCOPY src ./src\nRUN mvn package -DskipTests\nFROM eclipse-temurin:21-jre\nCOPY --from=build /app/target/*.jar app.jar\nEXPOSE 8080\nENTRYPOINT [\"java\", \"-jar\", \"/app.jar\"]\n");
  } },
  getDependencies: () => [{ name: "spring-boot-starter-web", version: "3.4.0", type: "java" }],
  testing,
};
export default provider;
export { provider };
