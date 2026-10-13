import { useCallback, useRef, useState } from 'react';
import type { ExperimentAction, LearningMode, TeachingTaskId } from './teachingTasks';

export function useTeachingSession<T extends TeachingTaskId>(initialTask: T) {
  const [learningMode, setLearningModeState] = useState<LearningMode>('demo');
  const [activeTaskId, setActiveTaskIdState] = useState<T>(initialTask);
  const [completedTaskIds, setCompletedTaskIds] = useState<T[]>([]);
  const completedTaskIdsRef = useRef<T[]>([]);
  const [actions, setActions] = useState<ExperimentAction[]>([]);
  const [observations, setObservations] = useState<string[]>([]);
  const observationKeys = useRef(new Set<string>());
  const startedAt = useRef(new Date().toISOString());

  const recordAction = useCallback((type: string, detail: string, configuration?: Record<string, unknown>) => {
    setActions(current => [...current, { at: new Date().toISOString(), type, detail, ...(configuration ? { configuration } : {}) }]);
  }, []);
  const recordObservation = useCallback((key: string, detail: string) => {
    if (observationKeys.current.has(key)) return;
    observationKeys.current.add(key);
    setObservations(current => [...current, detail]);
  }, []);

  const setLearningMode = useCallback((mode: LearningMode) => {
    setLearningModeState(mode);
    recordAction('切换使用模式', mode === 'demo' ? '演示模式' : '自由探索模式');
  }, [recordAction]);

  const setActiveTaskId = useCallback((taskId: T) => {
    setActiveTaskIdState(taskId);
    recordAction('选择任务', taskId);
  }, [recordAction]);

  const markTaskComplete = useCallback((taskId: T, configuration?: Record<string, unknown>) => {
    if (completedTaskIdsRef.current.includes(taskId)) return;
    completedTaskIdsRef.current = [...completedTaskIdsRef.current, taskId];
    setCompletedTaskIds(completedTaskIdsRef.current);
    recordAction('完成任务', taskId, configuration);
  }, [recordAction]);

  const resetSession = useCallback(() => {
    startedAt.current = new Date().toISOString();
    completedTaskIdsRef.current = [];
    setCompletedTaskIds([]);
    setActions([]);
    observationKeys.current.clear();
    setObservations([]);
  }, []);

  return { learningMode, setLearningMode, activeTaskId, setActiveTaskId, completedTaskIds, markTaskComplete, actions, recordAction, observations, recordObservation, startedAt: startedAt.current, resetSession };
}
