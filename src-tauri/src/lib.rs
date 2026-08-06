use tauri_plugin_sql::{Migration, MigrationKind};

// Connection string is shared with the frontend (see src/lib/db.ts).
const DB_URL: &str = "sqlite:jobtracker.db";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial schema",
            sql: include_str!("../migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add end_date",
            sql: include_str!("../migrations/0002_end_date.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add hourly",
            sql: include_str!("../migrations/0003_hourly.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add stages table",
            sql: include_str!("../migrations/0004_stages.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // The updater is desktop-only.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let _ = app;
            Ok(())
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DB_URL, migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
