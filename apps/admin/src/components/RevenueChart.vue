<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { formatKes } from '@/lib/format';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const props = defineProps<{ daily: { date: string; revenueMinor: number; orders: number }[] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
let chart: Chart | null = null;

const label = (iso: string) =>
  new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });

function render() {
  if (!canvas.value) return;
  chart?.destroy();
  chart = new Chart(canvas.value, {
    type: 'bar',
    data: {
      labels: props.daily.map((d) => label(d.date)),
      datasets: [
        {
          label: 'Revenue',
          data: props.daily.map((d) => d.revenueMinor / 100),
          backgroundColor: '#3b5bfd',
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const day = props.daily[ctx.dataIndex]!;
              return `${formatKes(day.revenueMinor)} · ${day.orders} order${day.orders === 1 ? '' : 's'}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkipPadding: 12, color: '#5b6478' },
        },
        y: {
          beginAtZero: true,
          grid: { color: '#eef1f6' },
          ticks: { color: '#5b6478', callback: (v) => formatKes(Number(v) * 100) },
        },
      },
    },
  });
}

onMounted(render);
watch(() => props.daily, render);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="relative h-64">
    <canvas
      ref="canvas"
      role="img"
      :aria-label="`Daily revenue for the last ${daily.length} days`"
    />
  </div>
</template>
