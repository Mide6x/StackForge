import type { BackendId, DatabaseId } from "../catalog.js";

export interface RenderedBackendFile {
  path: string;
  content: string;
  replace: boolean;
}

function expressDatabase(databaseId: DatabaseId): {
  imports: string;
  client: string;
  health: string;
  startup: string;
  shutdown: string;
} {
  if (databaseId === "postgres") {
    return {
      imports: 'import { Pool } from "pg";',
      client: `const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});`,
      health: 'await pool.query("SELECT 1");',
      startup: 'await pool.query("SELECT 1");',
      shutdown: "await pool.end();",
    };
  }
  if (databaseId === "mongodb") {
    return {
      imports: 'import { MongoClient } from "mongodb";',
      client: `const mongoClient = new MongoClient(
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/app",
);`,
      health: 'await mongoClient.db().command({ ping: 1 });',
      startup: "await mongoClient.connect();",
      shutdown: "await mongoClient.close();",
    };
  }
  return {
    imports: 'import { createClient } from "@supabase/supabase-js";',
    client: `const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});`,
    health: `const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) throw error;`,
    startup: `const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw error;`,
    shutdown: "return;",
  };
}

function renderExpress(
  databaseId: DatabaseId,
  frontendOrigin: string | undefined,
  typeScript: boolean,
): RenderedBackendFile[] {
  const database = expressDatabase(databaseId);
  const returnType = typeScript ? ": Promise<void>" : "";
  const corsImport = frontendOrigin ? 'import cors from "cors";\n' : "";
  const corsConfiguration = frontendOrigin
    ? `const frontendUrl = process.env.FRONTEND_URL ?? "${frontendOrigin}";\n`
    : "";
  const corsMiddleware = frontendOrigin ? "app.use(cors({ origin: frontendUrl }));\n" : "";
  return [{
    path: `src/index.${typeScript ? "ts" : "js"}`,
    replace: true,
    content: `import "dotenv/config";
${corsImport}import express from "express";
${database.imports}

const app = express();
const port = Number(process.env.PORT ?? 3001);
${corsConfiguration}${database.client}

${corsMiddleware}app.use(express.json());

app.get("/health", async (_request, response) => {
  try {
    ${database.health}
    response.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed", error);
    response.status(503).json({ status: "error", database: "unavailable" });
  }
});

async function start()${returnType} {
  ${database.startup}
  app.listen(port, () => console.log(\`API listening on :\${port}\`));
}

async function shutdown()${returnType} {
  ${database.shutdown}
}

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

start().catch((error) => {
  console.error("API failed to start", error);
  process.exit(1);
});
`,
  }];
}

function fastApiConfig(databaseId: DatabaseId, frontendOrigin: string | undefined): string {
  const field = databaseId === "postgres"
    ? 'database_url: str = "postgresql://postgres:postgres@localhost:5432/app"'
    : databaseId === "mongodb"
      ? 'mongodb_uri: str = "mongodb://localhost:27017/app"'
      : `supabase_url: str
    supabase_service_role_key: str`;
  return `from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ${frontendOrigin ? `frontend_url: str = "${frontendOrigin}"\n    ` : ""}${field}

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


settings = Settings()
`;
}

function fastApiDatabase(databaseId: DatabaseId): string {
  if (databaseId === "postgres") {
    return `import asyncio

from sqlalchemy import create_engine, text

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


async def check_database() -> None:
    def query() -> None:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    await asyncio.to_thread(query)


async def close_database() -> None:
    await asyncio.to_thread(engine.dispose)
`;
  }
  if (databaseId === "mongodb") {
    return `from pymongo import AsyncMongoClient

from app.config import settings

client = AsyncMongoClient(settings.mongodb_uri)


async def check_database() -> None:
    await client.admin.command({"ping": 1})


async def close_database() -> None:
    await client.close()
`;
  }
  return `import asyncio

from supabase import Client, create_client

from app.config import settings

client: Client = create_client(
    settings.supabase_url,
    settings.supabase_service_role_key,
)


async def check_database() -> None:
    await asyncio.to_thread(client.auth.admin.list_users, page=1, per_page=1)


async def close_database() -> None:
    return None
`;
}

function renderFastApi(
  databaseId: DatabaseId,
  frontendOrigin: string | undefined,
): RenderedBackendFile[] {
  const corsImport = frontendOrigin
    ? "from fastapi.middleware.cors import CORSMiddleware\n"
    : "";
  const corsConfiguration = frontendOrigin
    ? `app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
`
    : "";
  return [
    {
      path: "app/config.py",
      replace: false,
      content: fastApiConfig(databaseId, frontendOrigin),
    },
    {
      path: "app/database.py",
      replace: false,
      content: fastApiDatabase(databaseId),
    },
    {
      path: "app/main.py",
      replace: true,
      content: `from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
${corsImport}

from app.config import settings
from app.database import check_database, close_database


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await check_database()
    yield
    await close_database()


app = FastAPI(title="StackForge API", lifespan=lifespan)
${corsConfiguration}


@app.get("/health")
async def health() -> dict[str, str]:
    try:
        await check_database()
        return {"status": "ok", "database": "connected"}
    except Exception as error:
        raise HTTPException(
            status_code=503,
            detail={"status": "error", "database": "unavailable"},
        ) from error
`,
    },
  ];
}

function springDatabaseSource(databaseId: DatabaseId): string {
  if (databaseId === "postgres") {
    return `@org.springframework.stereotype.Component
class DatabaseHealth {
  private final org.springframework.jdbc.core.JdbcTemplate jdbc;

  DatabaseHealth(org.springframework.jdbc.core.JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  void check() {
    jdbc.queryForObject("SELECT 1", Integer.class);
  }
}`;
  }
  if (databaseId === "mongodb") {
    return `@org.springframework.stereotype.Component
class DatabaseHealth {
  private final org.springframework.data.mongodb.core.MongoTemplate mongo;

  DatabaseHealth(org.springframework.data.mongodb.core.MongoTemplate mongo) {
    this.mongo = mongo;
  }

  void check() {
    mongo.executeCommand("{ ping: 1 }");
  }
}`;
  }
  return `@org.springframework.stereotype.Component
class DatabaseHealth {
  private final java.net.http.HttpClient http = java.net.http.HttpClient.newHttpClient();
  private final String url;
  private final String serviceRoleKey;

  DatabaseHealth(
      @org.springframework.beans.factory.annotation.Value("\${stackforge.supabase-url}") String url,
      @org.springframework.beans.factory.annotation.Value("\${stackforge.supabase-service-role-key}") String serviceRoleKey) {
    this.url = url;
    this.serviceRoleKey = serviceRoleKey;
  }

  void check() throws Exception {
    var request = java.net.http.HttpRequest.newBuilder(java.net.URI.create(url + "/rest/v1/"))
        .header("apikey", serviceRoleKey)
        .header("Authorization", "Bearer " + serviceRoleKey)
        .header("Accept", "application/openapi+json")
        .GET()
        .build();
    var response = http.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
    if (response.statusCode() >= 500) {
      throw new IllegalStateException("Supabase returned " + response.statusCode());
    }
  }
}`;
}

function springProperties(databaseId: DatabaseId, frontendOrigin: string | undefined): string {
  const database = databaseId === "postgres"
    ? `spring.datasource.url=\${DATABASE_URL:jdbc:postgresql://localhost:5432/app}
spring.datasource.username=\${POSTGRES_USER:postgres}
spring.datasource.password=\${POSTGRES_PASSWORD:postgres}
spring.jpa.hibernate.ddl-auto=validate`
    : databaseId === "mongodb"
      ? "spring.data.mongodb.uri=${MONGODB_URI:mongodb://localhost:27017/app}"
      : `stackforge.supabase-url=\${SUPABASE_URL}
stackforge.supabase-service-role-key=\${SUPABASE_SERVICE_ROLE_KEY}`;
  return `spring.application.name=backend
server.port=\${PORT:8080}
${frontendOrigin ? `stackforge.frontend-url=\${FRONTEND_URL:${frontendOrigin}}\n` : ""}${database}
`;
}

function renderSpringBoot(
  databaseId: DatabaseId,
  frontendOrigin: string | undefined,
): RenderedBackendFile[] {
  const corsImports = frontendOrigin
    ? `import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
`
    : "";
  const corsConfiguration = frontendOrigin
    ? `@Configuration
class CorsConfiguration implements WebMvcConfigurer {
  private final String frontendUrl;

  CorsConfiguration(@Value("\${stackforge.frontend-url}") String frontendUrl) {
    this.frontendUrl = frontendUrl;
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
        .allowedOrigins(frontendUrl)
        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
  }
}
`
    : "";
  return [
    {
      path: "src/main/resources/application.properties",
      replace: true,
      content: springProperties(databaseId, frontendOrigin),
    },
    {
      path: "src/main/java/com/stackforge/backend/Application.java",
      replace: true,
      content: `package com.stackforge.backend;

import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
${corsImports}

@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}

${corsConfiguration}

@RestController
class HealthController {
  private final DatabaseHealth database;

  HealthController(DatabaseHealth database) {
    this.database = database;
  }

  @GetMapping("/health")
  Map<String, String> health() {
    try {
      database.check();
      return Map.of("status", "ok", "database", "connected");
    } catch (Exception error) {
      throw new DatabaseUnavailableException(error);
    }
  }
}

@ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
class DatabaseUnavailableException extends RuntimeException {
  DatabaseUnavailableException(Throwable cause) {
    super("Database is unavailable", cause);
  }
}

${springDatabaseSource(databaseId)}
`,
    },
  ];
}

export function renderBackendFiles(
  backendId: BackendId,
  databaseId: DatabaseId,
  frontendOrigin: string | undefined,
  typeScript: boolean,
): RenderedBackendFile[] {
  if (backendId === "express") {
    return renderExpress(databaseId, frontendOrigin, typeScript);
  }
  if (backendId === "fastapi") return renderFastApi(databaseId, frontendOrigin);
  return renderSpringBoot(databaseId, frontendOrigin);
}
