#ifndef SSHMGR_NETWATCH_NATIVE_H
#define SSHMGR_NETWATCH_NATIVE_H

// Starts watching the network path; calls goNetworkChanged(up) whenever the
// path's status, interfaces or gateways change. Idempotent.
void sshmgrStartNetworkWatch(void);

#endif
