// Built-in routine library: original programs (not copied from Hevy).
// Exercises reference catalog names; clone endpoint resolves them at runtime.

export interface LibraryRoutine {
  name: string;
  exercises: Array<{ exercise: string; sets: number; reps: string }>;
}

export interface LibraryProgram {
  id: string;
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  goal: string;
  equipment: string[];
  description: string;
  routines: LibraryRoutine[];
}

function r(name: string, exercises: Array<[string, number, string]>): LibraryRoutine {
  return {
    name,
    exercises: exercises.map(([exercise, sets, reps]) => ({ exercise, sets, reps }))
  };
}

export const LIBRARY_PROGRAMS: LibraryProgram[] = [
  {
    id: "beginner-full-body",
    title: "Beginner Full Body (3x/week)",
    level: "beginner",
    goal: "Build a strength base with simple full-body sessions.",
    equipment: ["barbell", "dumbbell", "machine", "bodyweight"],
    description: "Three full-body days. Add a little weight when all sets hit the top of the rep range.",
    routines: [
      r("Full Body A", [
        ["Squat (Barbell)", 3, "5"],
        ["Bench Press (Barbell)", 3, "5"],
        ["Bent Over Row (Barbell)", 3, "8"],
        ["Plank", 3, "60s"]
      ]),
      r("Full Body B", [
        ["Deadlift (Barbell)", 3, "5"],
        ["Overhead Press (Barbell)", 3, "8"],
        ["Lat Pulldown (Cable)", 3, "10"],
        ["Crunch", 3, "15"]
      ])
    ]
  },
  {
    id: "push-pull-legs",
    title: "Push Pull Legs (6x/week)",
    level: "intermediate",
    goal: "Classic 6-day split for steady hypertrophy.",
    equipment: ["barbell", "dumbbell", "cable", "machine"],
    description: "Push, pull, legs repeated. Rest one day after legs.",
    routines: [
      r("Push", [
        ["Bench Press (Barbell)", 4, "8"],
        ["Overhead Press (Dumbbell)", 3, "10"],
        ["Chest Fly (Dumbbell)", 3, "12"],
        ["Triceps Pushdown (Cable)", 3, "12"]
      ]),
      r("Pull", [
        ["Deadlift (Barbell)", 3, "5"],
        ["Pull Up", 4, "8"],
        ["Seated Cable Row (Cable)", 3, "10"],
        ["Curl (Barbell)", 3, "12"]
      ]),
      r("Legs", [
        ["Squat (Barbell)", 4, "6"],
        ["Romanian Deadlift (Barbell)", 3, "10"],
        ["Leg Press (Machine)", 3, "12"],
        ["Standing Calf Raise (Machine)", 4, "15"]
      ])
    ]
  },
  {
    id: "starting-strength-5x5",
    title: "5x5 Strength Builder",
    level: "beginner",
    goal: "Get strong on five compound lifts.",
    equipment: ["barbell", "bodyweight"],
    description: "Alternate A/B sessions, 5 sets of 5, add weight each session.",
    routines: [
      r("Workout A", [
        ["Squat (Barbell)", 5, "5"],
        ["Bench Press (Barbell)", 5, "5"],
        ["Bent Over Row (Barbell)", 5, "5"]
      ]),
      r("Workout B", [
        ["Squat (Barbell)", 5, "5"],
        ["Overhead Press (Barbell)", 5, "5"],
        ["Deadlift (Barbell)", 3, "5"]
      ])
    ]
  },
  {
    id: "dumbbell-home",
    title: "Dumbbell Home Plan",
    level: "beginner",
    goal: "Train at home with just dumbbells and a bench.",
    equipment: ["dumbbell", "bodyweight"],
    description: "Upper/lower split, minimal gear, 45-minute sessions.",
    routines: [
      r("Upper", [
        ["Bench Press (Dumbbell)", 3, "10"],
        ["Single Arm Row (Dumbbell)", 3, "10"],
        ["Overhead Press (Dumbbell)", 3, "10"],
        ["Curl (Dumbbell)", 2, "12"]
      ]),
      r("Lower + Core", [
        ["Goblet Squat (Dumbbell)", 3, "12"],
        ["Romanian Deadlift (Dumbbell)", 3, "10"],
        ["Lunge (Dumbbell)", 2, "12"],
        ["Plank", 3, "45s"]
      ])
    ]
  },
  {
    id: "bodyweight-foundations",
    title: "Bodyweight Foundations",
    level: "beginner",
    goal: "Start training with zero equipment.",
    equipment: ["bodyweight"],
    description: "Progress reps weekly; elevate to harder variants when easy.",
    routines: [
      r("Bodyweight Full Body", [
        ["Push Up", 3, "12"],
        ["Inverted Row (Bodyweight)", 3, "10"],
        ["Squat (Bodyweight)", 3, "20"],
        ["Plank", 3, "45s"],
        ["Crunch", 2, "15"]
      ])
    ]
  },
  {
    id: "upper-lower-hypertrophy",
    title: "Upper / Lower Hypertrophy (4x/week)",
    level: "intermediate",
    goal: "Balanced 4-day muscle building split.",
    equipment: ["barbell", "dumbbell", "cable", "machine"],
    description: "Two upper, two lower days with varied rep ranges.",
    routines: [
      r("Upper Strength", [
        ["Bench Press (Barbell)", 4, "6"],
        ["Bent Over Row (Barbell)", 4, "6"],
        ["Overhead Press (Dumbbell)", 3, "8"],
        ["Lat Pulldown (Cable)", 3, "10"]
      ]),
      r("Lower Strength", [
        ["Squat (Barbell)", 4, "6"],
        ["Romanian Deadlift (Barbell)", 3, "8"],
        ["Leg Extension (Machine)", 3, "12"],
        ["Standing Calf Raise (Machine)", 3, "15"]
      ]),
      r("Upper Volume", [
        ["Incline Bench Press (Dumbbell)", 3, "10"],
        ["Seated Cable Row (Cable)", 3, "12"],
        ["Lateral Raise (Dumbbell)", 3, "15"],
        ["Hammer Curl (Dumbbell)", 3, "12"]
      ]),
      r("Lower Volume", [
        ["Front Squat (Barbell)", 3, "8"],
        ["Hip Thrust (Barbell)", 3, "10"],
        ["Leg Curl (Machine)", 3, "12"],
        ["Side Plank", 2, "45s"]
      ])
    ]
  }
];
