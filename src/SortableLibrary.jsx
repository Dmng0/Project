import React from "react";
import { GripVertical, Folder } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
const accessibility = {
  announcements: {
    onDragStart: ({ active }) =>
      `${active.data.current?.title || "항목"} 순서 변경을 시작합니다.`,
    onDragOver: ({ over }) =>
      over
        ? `${over.data.current?.title || "항목"} 위치로 이동합니다.`
        : "이동할 위치를 선택하세요.",
    onDragEnd: () => "끌기 동작을 마쳤습니다.",
    onDragCancel: () => "순서 변경을 취소했습니다.",
  },
  screenReaderInstructions: {
    draggable:
      "순서를 바꾸려면 Space를 누르세요. 방향키로 이동하고 Space로 저장하거나 Escape로 취소하세요.",
  },
};
function BookItem({ book, index, disabled, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: book.id, data: { title: book.title }, disabled });
  const handle = (
    <button
      type="button"
      className="icon-btn drag-handle"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`${book.title} 순서 변경`}
      title="끌어서 순서 변경"
      disabled={disabled}
    >
      <GripVertical size={17} />
    </button>
  );
  return (
    <article
      data-book-id={book.id}
      ref={setNodeRef}
      className={`book-card ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {children(book, index, handle)}
    </article>
  );
}
export function SortableShelf({ books, list, disabled, onMove, children }) {
  const sensors = useDragSensors();
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(active.id, over.id);
      }}
    >
      <SortableContext
        items={books.map((b) => b.id)}
        strategy={list ? verticalListSortingStrategy : rectSortingStrategy}
      >
        <div className={list ? "book-list" : "book-grid"}>
          {books.map((b, i) => (
            <BookItem book={b} index={i} key={b.id} disabled={disabled}>
              {children}
            </BookItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
function FolderItem({ name, count, active, onOpen, disabled }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: name, data: { title: name }, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`folder-nav-row ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className={active ? "nav active" : "nav"} onClick={onOpen}>
        <Folder size={17} />
        <span className="series-name">{name}</span>
        <small>{count}</small>
      </button>
      <button
        className="icon-btn drag-handle folder-drag-handle"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`${name} 폴더 순서 변경`}
        title="끌어서 폴더 순서 변경"
        disabled={disabled}
      >
        <GripVertical size={15} />
      </button>
    </div>
  );
}
export function SortableFolders({
  names,
  books,
  filter,
  onOpen,
  onMove,
  disabled,
}) {
  const sensors = useDragSensors();
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={accessibility}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onMove(active.id, over.id);
      }}
    >
      <SortableContext items={names} strategy={rectSortingStrategy}>
        <div className="folder-nav-list">
          {names.map((name) => (
            <FolderItem
              key={name}
              name={name}
              count={books.filter((b) => b.series === name).length}
              active={filter === `series:${name}`}
              onOpen={() => onOpen(name)}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
