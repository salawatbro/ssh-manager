#import <Foundation/Foundation.h>
#import <Network/Network.h>
#include <stdlib.h>
#include <string.h>
#include "_cgo_export.h"
#include "netwatch_native.h"

#define SIG_CAP 1024

static nw_path_monitor_t gMonitor = NULL;
// Touched only on the monitor's serial queue.
static char gLast[SIG_CAP];
static int gSeen = 0;

static void appendPart(char *sig, const char *part) {
  strlcat(sig, ",", SIG_CAP);
  strlcat(sig, part, SIG_CAP);
}

void sshmgrStartNetworkWatch(void) {
  if (gMonitor != NULL) {
    return;
  }
  gMonitor = nw_path_monitor_create();
  nw_path_monitor_set_queue(gMonitor, dispatch_queue_create("uz.salawat.sshmgr.netwatch", DISPATCH_QUEUE_SERIAL));
  nw_path_monitor_set_update_handler(gMonitor, ^(nw_path_t path) {
    int up = nw_path_get_status(path) == nw_path_status_satisfied;
    char sig[SIG_CAP];
    char *sigp = sig;
    strlcpy(sig, up ? "up" : "down", SIG_CAP);
    nw_path_enumerate_interfaces(path, ^bool(nw_interface_t iface) {
      appendPart(sigp, nw_interface_get_name(iface));
      return true;
    });
    // A new Wi-Fi network on the same interface shows only as a new gateway.
    if (@available(macOS 13.0, *)) {
      nw_path_enumerate_gateways(path, ^bool(nw_endpoint_t gateway) {
        char *addr = nw_endpoint_copy_address_string(gateway);
        if (addr != NULL) {
          appendPart(sigp, addr);
          free(addr);
        }
        return true;
      });
    }
    // The first update describes the network at start, not a change.
    if (gSeen && strcmp(gLast, sig) != 0) {
      goNetworkChanged(up);
    }
    strlcpy(gLast, sig, SIG_CAP);
    gSeen = 1;
  });
  nw_path_monitor_start(gMonitor);
}
