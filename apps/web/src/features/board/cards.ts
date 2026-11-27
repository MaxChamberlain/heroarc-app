import { CARD_TITLES, type CardId } from '@heroarc/contracts';
import type { ComponentType } from 'react';
import { EnergyCard } from './cards/EnergyCard';
import { GoalsCard } from './cards/GoalsCard';
import { HabitsCard } from './cards/HabitsCard';
import { HealthCard } from './cards/HealthCard';
import { MeterCard } from './cards/MeterCard';
import { MoodCard } from './cards/MoodCard';
import { NutritionCard } from './cards/NutritionCard';
import { QuoteCard } from './cards/QuoteCard';
import { TrainingCard } from './cards/TrainingCard';
import { MoodTrendCard, SleepTrendCard, WeightTrendCard } from './cards/TrendCards';
import { WeightCard } from './cards/WeightCard';

export interface BoardCard {
  /** Name in the customize panel and edit chrome. */
  title: string;
  /** Groups the customize panel ("what kind of card"); has no effect on the board. */
  group: 'Today' | 'Log' | 'Trends';
  Component: ComponentType;
}

/**
 * Every board card, once. To add a card: add its id to CARD_IDS (@heroarc/contracts
 * layout.ts), its size rules and default position to @heroarc/domain layout.ts, then here.
 */
export const BOARD_CARDS: Record<CardId, BoardCard> = {
  meter: { title: CARD_TITLES.meter, group: 'Today', Component: MeterCard },
  health: { title: CARD_TITLES.health, group: 'Today', Component: HealthCard },
  goals: { title: CARD_TITLES.goals, group: 'Today', Component: GoalsCard },
  weight: { title: CARD_TITLES.weight, group: 'Today', Component: WeightCard },
  nutrition: { title: CARD_TITLES.nutrition, group: 'Today', Component: NutritionCard },
  thought: { title: CARD_TITLES.thought, group: 'Today', Component: QuoteCard },
  training: { title: CARD_TITLES.training, group: 'Log', Component: TrainingCard },
  habits: { title: CARD_TITLES.habits, group: 'Log', Component: HabitsCard },
  mood: { title: CARD_TITLES.mood, group: 'Log', Component: MoodCard },
  energy: { title: CARD_TITLES.energy, group: 'Trends', Component: EnergyCard },
  weightTrend: { title: CARD_TITLES.weightTrend, group: 'Trends', Component: WeightTrendCard },
  sleepTrend: { title: CARD_TITLES.sleepTrend, group: 'Trends', Component: SleepTrendCard },
  moodTrend: { title: CARD_TITLES.moodTrend, group: 'Trends', Component: MoodTrendCard },
};
