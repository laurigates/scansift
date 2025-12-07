/**
 * Scanner Discovery Service
 *
 * Discovers eSCL-compatible scanners on the local network using mDNS/Bonjour.
 * eSCL (AirPrint Scan) is an HTTP-based protocol that works with most modern scanners.
 */

import Bonjour, { type Service } from 'bonjour-service';
import { PERFORMANCE } from '@shared/constants';

export interface DiscoveredScanner {
  name: string;
  host: string;
  port: number;
  addresses: string[];
  txt?: Record<string, string>;
}

export interface ScannerCapabilities {
  version: string;
  makeAndModel?: string;
  serialNumber?: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  supportedResolutions: number[];
  colorModes: string[];
  documentFormats: string[];
}

/**
 * Discover eSCL scanners on the local network.
 * Uses mDNS to find devices advertising the '_uscan._tcp' service.
 */
export const discoverScanners = async (
  timeoutMs: number = PERFORMANCE.DISCOVERY_TIMEOUT_MS
): Promise<DiscoveredScanner[]> => {
  const bonjour = new Bonjour();
  const scanners: DiscoveredScanner[] = [];

  return new Promise((resolve) => {
    const browser = bonjour.find({ type: 'uscan' });

    browser.on('up', (service: Service) => {
      // Convert TXT records to object
      const txt: Record<string, string> = {};
      if (service.txt) {
        for (const [key, value] of Object.entries(service.txt)) {
          txt[key] = String(value);
        }
      }

      scanners.push({
        name: service.name,
        host: service.host,
        port: service.port || 80,
        addresses: service.addresses || [],
        txt,
      });

      console.log(`Found scanner: ${service.name} at ${service.host}:${service.port}`);
    });

    browser.on('down', (service: Service) => {
      console.log(`Scanner went offline: ${service.name}`);
    });

    // Stop discovery after timeout
    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(scanners);
    }, timeoutMs);
  });
};

/**
 * Fetch scanner capabilities using eSCL protocol.
 * Queries /eSCL/ScannerCapabilities endpoint.
 */
export const getScannerCapabilities = async (
  scanner: DiscoveredScanner
): Promise<ScannerCapabilities | null> => {
  const baseUrl = `http://${scanner.addresses[0] || scanner.host}:${scanner.port}`;

  try {
    const response = await fetch(`${baseUrl}/eSCL/ScannerCapabilities`);

    if (!response.ok) {
      console.error(`Failed to get capabilities: ${response.status}`);
      return null;
    }

    const xml = await response.text();
    return parseCapabilitiesXML(xml);
  } catch (error) {
    console.error(`Error fetching capabilities: ${error}`);
    return null;
  }
};

/**
 * Parse the XML capabilities response.
 * This is a simplified parser - production code should use a proper XML library.
 */
const parseCapabilitiesXML = (xml: string): ScannerCapabilities => {
  // Extract values using regex (simple approach for MVP)
  const extractValue = (tag: string): string | undefined => {
    const match = xml.match(new RegExp(`<[^:]*:?${tag}>([^<]+)<`, 'i'));
    return match?.[1];
  };

  const extractAllValues = (tag: string): string[] => {
    const regex = new RegExp(`<[^:]*:?${tag}>([^<]+)<`, 'gi');
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(xml)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  };

  // Extract resolutions (look for XResolution values)
  const resolutions = extractAllValues('XResolution')
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0);

  return {
    version: extractValue('Version') || '2.0',
    makeAndModel: extractValue('MakeAndModel'),
    serialNumber: extractValue('SerialNumber'),
    minWidth: Number(extractValue('MinWidth')) || 0,
    maxWidth: Number(extractValue('MaxWidth')) || 8500, // ~8.5 inches at 1000 DPI
    minHeight: Number(extractValue('MinHeight')) || 0,
    maxHeight: Number(extractValue('MaxHeight')) || 14000, // ~14 inches at 1000 DPI
    supportedResolutions: resolutions.length > 0 ? resolutions : [150, 300, 600],
    colorModes: extractAllValues('ColorMode'),
    documentFormats: extractAllValues('DocumentFormat'),
  };
};

/**
 * Get scanner status using eSCL protocol.
 */
export const getScannerStatus = async (
  scanner: DiscoveredScanner
): Promise<{ state: string; adfState?: string } | null> => {
  const baseUrl = `http://${scanner.addresses[0] || scanner.host}:${scanner.port}`;

  try {
    const response = await fetch(`${baseUrl}/eSCL/ScannerStatus`);

    if (!response.ok) {
      return null;
    }

    const xml = await response.text();

    // Extract scanner state
    const stateMatch = xml.match(/<[^:]*:?State>([^<]+)</i);
    const adfStateMatch = xml.match(/<[^:]*:?AdfState>([^<]+)</i);

    return {
      state: stateMatch?.[1] || 'Unknown',
      adfState: adfStateMatch?.[1],
    };
  } catch {
    return null;
  }
};
