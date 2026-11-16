// Public builds replace this with publicDemoOnly: true. Never add a shared origin.
export const deploymentPolicy = Object.freeze({
  publicDemoOnly: false,
  allowLoopback: true,
  personalOrigins: [],
});
