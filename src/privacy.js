import { deploymentPolicy } from './deployment-policy.js';
export function personalDataPolicy(location, policy = deploymentPolicy) {
  const url = new URL(location.href ?? location);
  if (policy.publicDemoOnly) return { allowed: false, reason: 'This public build accepts synthetic demonstration data only.' };
  if (url.hostname.endsWith('.github.io') || url.hostname === 'github.io') return { allowed: false, reason: 'GitHub Pages project sites share an origin. Personal entries, imports and linked files are disabled.' };
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const root = url.pathname === '/' || url.pathname === '/index.html';
  const dedicated = url.protocol === 'https:' && policy.personalOrigins.includes(url.origin);
  if (root && (loopback && policy.allowLoopback || dedicated)) return { allowed: true, reason: loopback ? 'Local development origin. Use only trusted code on this origin and obtain school approval before using school data.' : 'Explicitly configured dedicated HTTPS origin. School data policy still applies.' };
  return { allowed: false, reason: 'Personal data requires an explicitly configured dedicated HTTPS origin at its root, or a trusted local development origin. A different path does not isolate storage.' };
}
export function requirePersonalData(location, policy) {
  const result = personalDataPolicy(location, policy);
  if (!result.allowed) throw new Error(result.reason);
  return result;
}
