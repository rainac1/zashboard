<template>
  <div class="mx-auto flex max-w-2xl flex-col p-2 sm:p-4">
    <UsbipServerPanel
      v-for="server in servers"
      :key="server.serverTag"
      :server="server"
      :multi-tag="servers.length > 1"
    />
  </div>
</template>

<script setup lang="ts">
import UsbipServerPanel from '@/components/tools/UsbipServerPanel.vue'
import type { USBIPServerStatus } from '@/gen/daemon/started_service_pb'

defineProps<{ servers: USBIPServerStatus[] }>()
</script>
