<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import Home from './views/Home.vue'
import Create from './views/Create.vue'
import GroupView from './views/GroupView.vue'

const hash = ref(location.hash)
const onHash = () => { hash.value = location.hash; window.scrollTo(0, 0) }
onMounted(() => window.addEventListener('hashchange', onHash))
onUnmounted(() => window.removeEventListener('hashchange', onHash))

const route = computed(() => {
  const h = hash.value.replace(/^#\/?/, '')
  const m = /^g\/([a-z0-9]{8})/.exec(h)
  if (m) return { name: 'group' as const, id: m[1] }
  if (h.startsWith('new')) return { name: 'new' as const }
  return { name: 'home' as const }
})
</script>

<template>
  <header class="topbar">
    <a href="#/" class="brand"><img src="/icon.svg" alt="" width="28" height="28" /> DuesBook</a>
    <a v-if="route.name !== 'new'" href="#/new" class="btn small ghost">+ New group</a>
  </header>
  <main class="wrap">
    <Home v-if="route.name === 'home'" />
    <Create v-else-if="route.name === 'new'" />
    <GroupView v-else :key="route.id" :id="route.id" />
  </main>
  <footer class="foot">
    Non-custodial: dues go straight from members to the treasurer's Nimiq address. Each payment carries a public tag on the Nimiq blockchain, and the register is rebuilt from the chain.
    <br /><a href="https://github.com/dukemawex/duesbook" target="_blank" rel="noopener">Open source (MIT)</a>
  </footer>
</template>
