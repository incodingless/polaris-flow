<template>
  <div
    class="task-card-item"
    :class="{ 'task-card-item-active': active }"
    @click="$emit('click')"
  >
    <div class="task-card-item-cols">
      <div v-if="active" class="task-card-active-bar"></div>
      <div class="task-card-item-body">
        <div class="task-card-row1">
          <span class="task-card-tag-id">{{ displayChangeName }}</span>
          <span v-if="task.workflowShortName" class="task-card-tag-group">{{ task.workflowShortName }}</span>
        </div>
        <div class="task-card-row2">
          <span class="task-card-avatar" :style="{ borderColor: getGroupColor(task.groupTag) }">
            <svg class="icon icon--sm" viewBox="0 0 24 24">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <span class="task-card-title">{{ displayTitle }}</span>
        </div>
        <div class="task-card-row3">
          <span
            class="task-card-time"
            :class="{ 'task-card-time-archived': timeInfo.archived }"
          >{{ timeInfo.text }}</span>
          <span
            v-if="!timeInfo.archived"
            :class="['tag', 'tag-outline', 'task-card-status', stageTag.className]"
            :title="stageTag.label"
          >{{ stageTag.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatTaskCardTime, formatStageTag, getGroupColor, formatTaskCardTitle, isArchivedTask, stripArchivedNameDate } from '../utils/workflow.js'

const props = defineProps({
  task: { type: Object, required: true },
  active: { type: Boolean, default: false }
})

defineEmits(['click'])

const timeInfo = computed(() => formatTaskCardTime(props.task))
const stageTag = computed(() => formatStageTag(props.task))
const displayTitle = computed(() => formatTaskCardTitle(props.task))

/** 卡片 ID 区：展示变更 slug（归档项去掉日期前缀） */
const displayChangeName = computed(() => {
  const name = props.task?.name
  if (!name) return ''
  if (isArchivedTask(props.task)) return stripArchivedNameDate(name)
  return name
})
</script>
