// Called on sign-out (store.ts): this device stops receiving the previous account's
// notifications. The next sign-in subscribes again for the new account.
export const removeDevicePushSubscription = async () => {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
};
