import { migrateStorage } from "./storageMigration";

// The first import of main.tsx: stores read localStorage when they are created (the tabs),
// so LibreTeX's keys must be JuTeX's before any of them is imported.
if (typeof window !== "undefined") migrateStorage(window.localStorage);
