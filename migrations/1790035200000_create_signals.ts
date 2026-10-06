import { sql } from "kysely"

/**
 * Users, their Community Signals, and the items each signal generates
 */
export async function up(db) {
  await db.schema
    .withSchema("app")
    .createTable("users")
    .addColumn("id", "uuid", col =>
      col.primaryKey()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("email", "text", col => col.notNull().unique())
    .addColumn("name", "text")
    .addColumn("avatar_url", "text")
    .addColumn("provider", "text", col => col.notNull().defaultTo("google"))
    .addColumn("created_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_login_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema("app")
    .createTable("signals")
    .addColumn("id", "uuid", col =>
      col.primaryKey()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("owner_id", "uuid", col =>
      col.notNull()
        .references("app.users.id")
        .onDelete("cascade")
    )
    .addColumn("slug", "text", col => col.notNull().unique())
    .addColumn("title", "text", col => col.notNull())
    .addColumn("description", "text")
    .addColumn("medium", "text", col => col.notNull())
    .addColumn("model", "text", col => col.notNull())
    .addColumn("structure_prompt", "text")
    .addColumn("criteria", "jsonb", col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("visibility", "text", col => col.notNull().defaultTo("public"))
    .addColumn("created_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema("app")
    .createTable("signal_items")
    .addColumn("id", "uuid", col =>
      col.primaryKey()
        .defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("signal_id", "uuid", col =>
      col.notNull()
        .references("app.signals.id")
        .onDelete("cascade")
    )
    .addColumn("owner_id", "uuid", col => col.notNull())
    .addColumn("status", "text", col => col.notNull().defaultTo("queued"))
    .addColumn("medium", "text", col => col.notNull())
    .addColumn("model", "text", col => col.notNull())
    .addColumn("source", "text")
    .addColumn("pmid", "text")
    .addColumn("doi", "text")
    .addColumn("journal", "text")
    .addColumn("publication_url", "text")
    .addColumn("paper_title", "text")
    .addColumn("paper", "jsonb", col => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("title", "text")
    .addColumn("description", "text")
    .addColumn("tags", "jsonb", col => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("content", "jsonb")
    .addColumn("media_url", "text")
    .addColumn("duration", "text")
    .addColumn("error", "text")
    .addColumn("published", "boolean", col => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", col => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .withSchema("app")
    .createIndex("signal_items_signal_created_idx")
    .on("signal_items")
    .columns(["signal_id", "created_at"])
    .execute()

  await db.schema
    .withSchema("app")
    .createIndex("signal_items_owner_created_idx")
    .on("signal_items")
    .columns(["owner_id", "created_at"])
    .execute()
}

export async function down(db) {
  await db.schema.withSchema("app").dropTable("signal_items").execute()
  await db.schema.withSchema("app").dropTable("signals").execute()
  await db.schema.withSchema("app").dropTable("users").execute()
}
