import RoutineEditor from "../editor";

export default function EditRoutinePage({ params }: { params: { id: string } }) {
  return <RoutineEditor routineId={params.id} />;
}
