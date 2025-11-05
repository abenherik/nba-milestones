// Compatibility layer for the new database abstraction
export { 
  openDatabase as openSqlite,
  dbRun, 
  dbAll, 
  ensureCoreSchema,
  closeDatabase,
  type DatabaseConnection as SqliteDb 
} from './database';