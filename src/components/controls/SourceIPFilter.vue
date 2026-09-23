<template>
  <SelectInput
    class="select select-sm"
    v-model="sourceIPFilter"
    :options="[{ value: null, label: $t('all') }, ...sourceIPOpts]"
  />
</template>

<script setup lang="ts">
import { getConnectionSourceIP } from '@/helper'
import SelectInput from '@/components/common/SelectInput.vue'
import { reverseDNSRevision } from '@/helper/reverse-dns'
import { getIPLabelFromMap } from '@/helper/source-ip'
import { connections, sourceIPFilter } from '@/store/connections'
import { resolveClientHostname } from '@/store/settings'
import { activeUuid } from '@/store/setup'
import * as ipaddr from 'ipaddr.js'
import { isEqual, uniq } from 'lodash'
import { computed, ref, watch } from 'vue'

const sourceIPs = computed(() => {
  return uniq(connections.value.map(getConnectionSourceIP)).sort((a, b) => {
    if (!ipaddr.isValid(a)) return -1
    if (!ipaddr.isValid(b)) return 1

    const preIP = ipaddr.parse(a)
    const nextIP = ipaddr.parse(b)

    const isPreIPv4 = preIP.kind() === 'ipv4'
    const isNextIPv4 = nextIP.kind() === 'ipv4'

    if (!isPreIPv4 && isNextIPv4) return 1
    if (!isNextIPv4 && isPreIPv4) return -1

    const preIPBytes = preIP.toByteArray()
    const nextIPBytes = nextIP.toByteArray()

    for (let i = 0; i < preIPBytes.length; i++) {
      if (preIPBytes[i] !== nextIPBytes[i]) {
        return preIPBytes[i] - nextIPBytes[i]
      }
    }
    return 0
  })
})
const sourceIPOpts = ref<{ label: string; value: string[] }[]>([])
const sourceIPsKey = computed(() => sourceIPs.value.join('\u0000'))

watch(
  [sourceIPsKey, reverseDNSRevision, resolveClientHostname, activeUuid],
  () => {
    const options: { label: string; value: string[] }[] = []

    sourceIPs.value.forEach((ip) => {
      const label = getIPLabelFromMap(ip)
      const index = options.findIndex((opt) => opt.label === label)

      if (index === -1) {
        options.push({
          label,
          value: [ip],
        })
      } else {
        options[index].value.push(ip)
      }
    })

    if (sourceIPFilter.value !== null) {
      const currentLabel = getIPLabelFromMap(sourceIPFilter.value[0])
      const current = options.find((opt) => opt.label === currentLabel)

      if (!current) {
        options.unshift({
          label: currentLabel,
          value: sourceIPFilter.value,
        })
      } else if (!isEqual(current.value, sourceIPFilter.value)) {
        sourceIPFilter.value = current.value
      }
    }

    sourceIPOpts.value = options
  },
  {
    immediate: true,
  },
)
</script>
