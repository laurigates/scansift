/**
 * OCR processing module for extracting text and dates from photo images.
 *
 * Uses Tesseract.js for text recognition and chrono-node for date parsing.
 * Returns a PhotoMetadata record that can be attached to CroppedPhoto / Photo
 * records flowing through the scan pipeline.
 *
 * @module ocr
 */

import { parseDate } from 'chrono-node';
import Tesseract from 'tesseract.js';
import type { PhotoMetadata } from '@/shared/types';
import { OcrError } from '../errors';
import { logger } from '../logger';

/**
 * Minimum word confidence threshold (0–100) below which words are excluded
 * from the aggregated text and word list.
 */
const MIN_WORD_CONFIDENCE = 30;

/**
 * Extract text and date metadata from a photo image buffer.
 *
 * Runs Tesseract OCR on the image and attempts to parse any date expression
 * found in the extracted text using chrono-node. The function always resolves
 * (never throws on empty / unreadable input) — it returns a zero-confidence
 * PhotoMetadata when no text is found, and propagates OcrError only for
 * hard failures (e.g., corrupt image that Tesseract cannot open).
 *
 * @param image - JPEG or PNG buffer to analyse
 * @returns Resolved PhotoMetadata with extractedText, extractedDate, confidence, words
 * @throws OcrError if Tesseract cannot process the image at all
 */
export async function extractMetadata(image: Buffer): Promise<PhotoMetadata> {
  if (image.length === 0) {
    logger.debug('OCR skipped: empty image buffer');
    return { confidence: 0, words: [] };
  }

  let worker: Tesseract.Worker | null = null;

  try {
    // Suppress Tesseract's internal progress logging — we use our own.
    worker = await Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
      logger: () => undefined,
    });

    const { data } = await worker.recognize(image);

    // Collect high-confidence words
    const words = data.words
      .filter((w) => w.confidence >= MIN_WORD_CONFIDENCE)
      .map((w) => ({ text: w.text, confidence: w.confidence / 100 }));

    const extractedText = data.text.trim();

    if (!extractedText) {
      logger.debug('OCR complete: no text found in image');
      return { confidence: data.confidence / 100, words: [] };
    }

    logger.debug(
      { textLength: extractedText.length, confidence: data.confidence },
      'OCR complete: text extracted',
    );

    // Attempt date extraction via chrono-node
    const extractedDate = parseDate(extractedText);

    if (extractedDate) {
      logger.info({ extractedDate }, 'OCR date extracted');
    }

    const result: PhotoMetadata = {
      extractedText,
      confidence: data.confidence / 100,
      words,
    };
    if (extractedDate) {
      result.extractedDate = extractedDate;
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: error }, 'OCR failed');
    throw new OcrError(`OCR processing failed: ${message}`);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}
