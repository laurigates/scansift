/**
 * Drizzle ORM schema for ScanSift SQLite database.
 *
 * Tables:
 *   batches  — one record per scan batch (front + back pair session)
 *   photos   — one record per individual cropped photo
 *   pairs    — joins front photo to optional back photo within a batch
 */

import { type InferInsertModel, type InferSelectModel, relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// batches
// ---------------------------------------------------------------------------

export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  // status stores the ScanState discriminant — validated at application layer
  status: text('status').notNull(),
  outputDirectory: text('output_directory').notNull(),
});

export const batchesRelations = relations(batches, ({ many }) => ({
  photos: many(photos),
  pairs: many(pairs),
}));

export type Batch = InferSelectModel<typeof batches>;
export type NewBatch = InferInsertModel<typeof batches>;

// ---------------------------------------------------------------------------
// photos
// ---------------------------------------------------------------------------

export const photos = sqliteTable('photos', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  batchId: text('batch_id')
    .notNull()
    .references(() => batches.id),
  frontFilePath: text('front_file_path').notNull(),
  backFilePath: text('back_file_path'),
  originalFrontPath: text('original_front_path').notNull(),
  originalBackPath: text('original_back_path'),
  scanDate: text('scan_date').notNull(),
  photoDate: text('photo_date'),
  extractedText: text('extracted_text'),
  // GridPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  gridPosition: text('grid_position'),
  confidenceScore: real('confidence_score'),
});

export const photosRelations = relations(photos, ({ one }) => ({
  batch: one(batches, {
    fields: [photos.batchId],
    references: [batches.id],
  }),
}));

export type Photo = InferSelectModel<typeof photos>;
export type NewPhoto = InferInsertModel<typeof photos>;

// ---------------------------------------------------------------------------
// pairs
// ---------------------------------------------------------------------------

export const pairs = sqliteTable('pairs', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  batchId: text('batch_id')
    .notNull()
    .references(() => batches.id),
  frontPhotoId: integer('front_photo_id', { mode: 'number' })
    .notNull()
    .references(() => photos.id),
  backPhotoId: integer('back_photo_id', { mode: 'number' }).references(() => photos.id),
});

export const pairsRelations = relations(pairs, ({ one }) => ({
  batch: one(batches, {
    fields: [pairs.batchId],
    references: [batches.id],
  }),
  frontPhoto: one(photos, {
    fields: [pairs.frontPhotoId],
    references: [photos.id],
    relationName: 'frontPhoto',
  }),
  backPhoto: one(photos, {
    fields: [pairs.backPhotoId],
    references: [photos.id],
    relationName: 'backPhoto',
  }),
}));

export type Pair = InferSelectModel<typeof pairs>;
export type NewPair = InferInsertModel<typeof pairs>;
