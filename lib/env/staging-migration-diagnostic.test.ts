import { describe, expect, it } from "vitest";
import {
  formatStagingMigrationDiagnostic,
  stagingMigrationDiagnostic,
} from "./staging-migration-diagnostic";

const allowed = [
  "20260930192504_tickets_support.sql",
  "20260930192516_ticket_files_delivery.sql",
] as const;

describe("staging migration diagnostics", () => {
  it("exposes only an allowlisted migration, SQLSTATE and coarse category", () => {
    const failure = Object.assign(new Error("database-password=DO-NOT-LOG"), {
      stderr: "Applying migration 20260930192504_tickets_support.sql... FATAL details with customer@example.test (SQLSTATE 23505)",
      stdout: "postgresql://user:secret@database.invalid/postgres",
      code: 1,
    });
    const diagnostic = stagingMigrationDiagnostic("apply", failure, allowed);
    expect(diagnostic).toEqual({
      phase: "apply",
      category: "statement",
      migration: allowed[0],
      sqlstate: "23505",
    });
    const output = formatStagingMigrationDiagnostic(diagnostic);
    expect(output).toBe("phase=apply category=statement migration=20260930192504_tickets_support.sql sqlstate=23505");
    expect(output).not.toMatch(/DO-NOT-LOG|customer@|postgresql:|secret|FATAL/i);
  });

  it("rejects arbitrary filenames and SQLSTATE values from output", () => {
    const diagnostic = stagingMigrationDiagnostic("apply", {
      stderr: "Applying migration 20260101010101_injected.sql with SQLSTATE 99999 and token=SENSITIVE",
      code: "ENOENT",
    }, allowed);
    expect(diagnostic).toEqual({ phase: "apply", category: "statement" });
    const output = formatStagingMigrationDiagnostic(diagnostic);
    expect(output).toBe("phase=apply category=statement");
    expect(output).not.toMatch(/injected|99999|ENOENT|SENSITIVE/);
  });

  it("classifies transport failures without returning their raw messages", () => {
    const diagnostic = stagingMigrationDiagnostic("dry-run", {
      stderr: "unexpected EOF from aws-private.pooler.invalid; password=NEVER-LOG",
    }, allowed);
    expect(diagnostic).toEqual({ phase: "dry-run", category: "pooler" });
    expect(formatStagingMigrationDiagnostic(diagnostic)).toBe("phase=dry-run category=pooler");
  });

  it("does not classify connection options echoed in an exec error message as TLS", () => {
    const failure = Object.assign(new Error([
      "Command failed: pnpm exec supabase db push",
      "--db-url postgresql://user:secret@db.abcdefghijklmnopqrst.supabase.co/postgres?sslmode=verify-full&sslrootcert=/tmp/roots.pem",
    ].join(" ")), {
      stderr: "unexpected EOF while reading the server response",
      stdout: "",
      code: 1,
    });
    const diagnostic = stagingMigrationDiagnostic("dry-run", failure, allowed);
    expect(diagnostic).toEqual({
      phase: "dry-run",
      category: "transport",
      connection: "direct",
    });
    expect(formatStagingMigrationDiagnostic(diagnostic)).toBe(
      "phase=dry-run category=transport connection=direct",
    );
  });

  it("reports only a safe session-pooler class from a process command", () => {
    const failure = Object.assign(new Error(
      "Command failed: supabase db push --db-url postgresql://postgres.secret-ref:password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres",
    ), {
      stderr: "unexpected EOF",
      code: 1,
    });
    const output = formatStagingMigrationDiagnostic(
      stagingMigrationDiagnostic("dry-run", failure, allowed),
    );
    expect(output).toBe("phase=dry-run category=transport connection=session-pooler");
    expect(output).not.toMatch(/secret-ref|password|aws-|supabase\.com/i);
  });

  it("returns unknown when only a child-process command echo mentions TLS options", () => {
    const failure = Object.assign(new Error(
      "Command failed: supabase db push --db-url postgresql://database.invalid/postgres?sslmode=verify-full&sslrootcert=/tmp/roots.pem",
    ), {
      stderr: "",
      stdout: "",
      code: 1,
    });
    expect(stagingMigrationDiagnostic("dry-run", failure, allowed)).toEqual({
      phase: "dry-run",
      category: "unknown",
    });
  });

  it("accepts allowlisted codes from structured process errors and migration stems", () => {
    const diagnostic = stagingMigrationDiagnostic("apply", {
      code: "28p01",
      stdout: "Applying migration 20260930192516_ticket_files_delivery",
      message: "credential material that must remain private",
    }, allowed);
    expect(diagnostic).toEqual({
      phase: "apply",
      category: "authentication",
      migration: allowed[1],
      sqlstate: "28P01",
    });
  });

  it("reports the last explicitly applying migration after an earlier success", () => {
    const diagnostic = stagingMigrationDiagnostic("apply", {
      stderr: [
        "Applying migration 20260930192504_tickets_support.sql...",
        "Applying migration 20260930192516_ticket_files_delivery.sql...",
        "database error (SQLSTATE 42710)",
      ].join("\n"),
    }, allowed);
    expect(diagnostic.migration).toBe(allowed[1]);
  });

  it("returns an unknown coarse category for opaque failures", () => {
    const diagnostic = stagingMigrationDiagnostic("dry-run", new Error("private opaque failure"), allowed);
    expect(diagnostic).toEqual({ phase: "dry-run", category: "unknown" });
    expect(JSON.stringify(diagnostic)).not.toContain("private opaque failure");
  });
});
