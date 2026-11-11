<script setup lang="ts">
import { ref } from 'vue'
import { recentGroups } from '../lib/local'
import { inNimiqPay } from '../lib/wallet'

const recent = recentGroups()
const code = ref('')
const err = ref('')
function open() {
  const m = /([a-z0-9]{8})\s*$/i.exec(code.value.trim())
  if (!m) { err.value = 'Paste the 8-character group code or the full group link.'; return }
  location.hash = `#/g/${m[1].toLowerCase()}`
}
</script>

<template>
  <section class="hero">
    <h1>Collect group dues in NIM.<br />Know who has paid.</h1>
    <p class="lead">For estate associations, alumni sets, cooperatives, church groups and age-grade meetings that collect monthly or weekly dues.
      Members pay with one tap in Nimiq Pay. The paid and unpaid list updates itself from the blockchain, so nobody has to send screenshots.</p>
    <div class="row">
      <a href="#/new" class="btn">Start a group (treasurer)</a>
    </div>
    <p v-if="!inNimiqPay()" class="hint">Tip: open this page inside <b>Nimiq Pay → Mini Apps</b> to pay with one tap. In a normal browser you can still view registers and pay from any Nimiq wallet by QR code.</p>
  </section>

  <section v-if="recent.length" class="card">
    <h2>Your groups</h2>
    <a v-for="g in recent" :key="g.id" :href="`#/g/${g.id}`" class="list-row">
      <span>{{ g.name }}</span>
      <span class="muted small">{{ g.adminToken ? 'Treasurer' : g.memberId ? 'Member' : 'Viewed' }} ›</span>
    </a>
  </section>

  <section class="card">
    <h2>Joining a group?</h2>
    <p class="muted">Your treasurer shares a link or code. Paste it here.</p>
    <form class="row" @submit.prevent="open">
      <input v-model="code" placeholder="e.g. k3x9q2ab or the full link" aria-label="Group code" />
      <button class="btn" type="submit">Open</button>
    </form>
    <p v-if="err" class="error">{{ err }}</p>
  </section>

  <section class="card">
    <h2>How it works</h2>
    <ol class="steps">
      <li><b>Treasurer</b> creates the group: the dues amount, weekly, monthly or one-off, and the member names. Payments go to the treasurer's own Nimiq Pay address.</li>
      <li><b>Share the link</b> on WhatsApp. Each member picks their name once.</li>
      <li><b>Members pay</b> in Nimiq Pay. The payment carries a short public tag, for example <code>DB1:k3x9q2ab:2026-11:4</code>, that says which group, period and member it is for.</li>
      <li><b>The register updates itself</b> from the Nimiq blockchain. It shows who has paid, part-paid or not paid, and any arrears. You can export it to CSV and send unpaid members a reminder on WhatsApp.</li>
    </ol>
  </section>
</template>
