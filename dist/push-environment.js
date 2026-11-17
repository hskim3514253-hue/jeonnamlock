// Device detection only chooses setup instructions. Push API availability remains required.
export function pushEnvironment(options) {
  const appleMobile=/iPhone|iPad|iPod/i.test(options.userAgent||'') || (options.platform==='MacIntel' && options.maxTouchPoints>1);
  const standalone=Boolean(options.standalone||options.displayStandalone);
  const needsHomeScreen=appleMobile&&!standalone;
  const supported=Boolean(options.secure&&options.hasServiceWorker&&options.hasPushManager&&options.hasNotification);
  const blocked=supported&&options.permission==='denied';
  return {appleMobile,standalone,needsHomeScreen,supported,blocked,canEnable:supported&&!needsHomeScreen&&!blocked};
}
