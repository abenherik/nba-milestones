// Compatibility layer for the new database abstraction
export { 
  openDatabase as openSqlite,
  dbRun, 
  dbExec,
  dbBatch,
  dbAll, 
  ensureCoreSchema,
  ensureCoreSchemaOnce,
  closeDatabase,
  type DatabaseConnection as SqliteDb 
} from './database';