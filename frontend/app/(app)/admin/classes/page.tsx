"use client";

import {
  ArrowClockwise,
  ChalkboardTeacher,
  LinkSimple,
  PlayCircle,
  Plus,
  Trash,
  UserPlus,
  UsersThree,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { ClassGuide } from "@/components/ClassGuide";
import { EmptyState } from "@/components/EmptyState";
import { GuestLinkDialog } from "@/components/GuestLinkDialog";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonRows } from "@/components/Skeleton";
import { SubjectIcon } from "@/components/SubjectIcon";
import { useToast } from "@/components/Toast";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { num } from "@/lib/format";
import type { ClassRoom, Offering, Subject, User } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

const YEAR = "1405-1406";

export default function AdminClassesPage() {
  const { push } = useToast();
  const {
    data: classes,
    loading,
    reload: reloadClasses,
    setData: setClasses,
  } = useAsync<ClassRoom[]>(() => apiGet("/classes"));
  const {
    data: subjects,
    reload: reloadSubjects,
    setData: setSubjects,
  } = useAsync<Subject[]>(() => apiGet("/subjects"));
  const { data: teachers } = useAsync<{ items: User[] }>(() => apiGet("/admin/users?role=teacher"));
  const { data: students } = useAsync<{ items: User[] }>(() => apiGet("/admin/users?role=student"));

  const [selected, setSelected] = useState<ClassRoom | null>(null);
  const [tab, setTab] = useState<"students" | "offerings">("offerings");
  const [detail, setDetail] = useState<{ students: any[]; offerings: Offering[] } | null>(null);

  const [classModal, setClassModal] = useState(false);
  const [offeringModal, setOfferingModal] = useState(false);
  const [subjectModal, setSubjectModal] = useState(false);
  const [studentModal, setStudentModal] = useState(false);

  const [className, setClassName] = useState("");
  const [grade, setGrade] = useState(3);
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [teacherId, setTeacherId] = useState<string | number | "">("");
  const [subjectTitle, setSubjectTitle] = useState("");
  const [studentId, setStudentId] = useState<string | number | "">("");
  const [busy, setBusy] = useState(false);

  // Inline «درس تازه» inside the offering dialog, so an empty school never has
  // to leave the dialog (and refresh the page) just to create the first lesson.
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [creatingSubject, setCreatingSubject] = useState(false);

  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "class" | "subject" | "offering"; id: number; name: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  // The admin can watch a live class: the lesson link is always visible and
  // the join button appears as soon as the teacher starts the room.
  const [linkOffering, setLinkOffering] = useState<Offering | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!classes?.length) return;
    if (!selected) setSelected(classes[0]);
  }, [classes, selected]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let alive = true;
    setDetail(null);
    Promise.all([
      apiGet<any[]>(`/classes/${selected.id}/students`),
      apiGet<Offering[]>(`/classes/${selected.id}/offerings`),
    ])
      .then(([studentsList, offerings]) => {
        if (alive) setDetail({ students: studentsList, offerings });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [selected, refreshKey]);

  async function joinOffering(offering: Offering) {
    const running = (offering.sessions || []).find((row) => row.status === "running");
    if (!running) {
      push("کلاس هنوز شروع نشده است؛ لینک فقط در زمان برگزاری باز است.", "info");
      return;
    }
    if (joiningId) return;
    setJoiningId(offering.id);
    try {
      const result = await apiPost<{ joinUrl: string }>(`/sessions/${running.id}/join`);
      window.location.assign(result.joinUrl);
    } catch (error) {
      push(error instanceof Error ? error.message : "ورود به کلاس ممکن نشد", "error");
      setJoiningId(null);
    }
  }

  async function createClass(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await apiPost<ClassRoom>("/classes", { name: className, grade, year: YEAR });
      // Put it in the sidebar immediately; no reload and no page refresh.
      setClasses((prev) => [...(prev || []), created]);
      setSelected(created);
      setDetail({ students: [], offerings: [] });
      setTab("offerings");
      push("کلاس ساخته شد؛ حالا دانش‌آموز و درس را اضافه کنید", "success");
      setClassModal(false);
      setClassName("");
      reloadClasses();
    } catch (error) {
      push(error instanceof Error ? error.message : "ساخت کلاس ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addOffering(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!subjectId || !teacherId) {
      push("درس و معلم را انتخاب کنید", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await apiPost<Offering>("/offerings", {
        class_room: selected.id,
        subject: subjectId,
        teacher: teacherId,
        year: YEAR,
      });
      // Show the new row at once instead of waiting for a manual refresh.
      setDetail((prev) =>
        prev ? { ...prev, offerings: [...prev.offerings, created] } : { students: [], offerings: [created] },
      );
      setClasses((prev) =>
        (prev || []).map((room) =>
          room.id === selected.id ? { ...room, offeringCount: (room.offeringCount || 0) + 1 } : room,
        ),
      );
      push("درس به کلاس اضافه شد", "success");
      setOfferingModal(false);
      setSubjectId("");
      setTeacherId("");
      setShowNewSubject(false);
      reloadClasses();
    } catch (error) {
      push(error instanceof Error ? error.message : "افزودن درس ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createSubject(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const created = await apiPost<Subject>("/subjects", { title: subjectTitle });
      setSubjects((prev) => [...(prev || []), created]);
      push("درس ساخته شد و در فهرست انتخاب شد", "success");
      setSubjectModal(false);
      setSubjectTitle("");
      reloadSubjects();
    } catch (error) {
      push(error instanceof Error ? error.message : "ساخت درس ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  async function createSubjectInline(event?: React.SyntheticEvent) {
    event?.preventDefault();
    const title = newSubjectTitle.trim();
    if (!title) return;
    setCreatingSubject(true);
    try {
      const created = await apiPost<Subject>("/subjects", { title });
      setSubjects((prev) => [...(prev || []), created]);
      setSubjectId(created.id);
      setNewSubjectTitle("");
      setShowNewSubject(false);
      push(`درس «${created.title}» ساخته و انتخاب شد`, "success");
      reloadSubjects();
    } catch (error) {
      push(error instanceof Error ? error.message : "ساخت درس ناموفق بود", "error");
    } finally {
      setCreatingSubject(false);
    }
  }

  async function confirmDeleteNow() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      if (confirmDelete.kind === "class") {
        await apiDelete(`/classes/${confirmDelete.id}`);
        const remaining = (classes || []).filter((room) => room.id !== confirmDelete.id);
        setClasses(remaining);
        setSelected((prev) => (prev && prev.id === confirmDelete.id ? remaining[0] || null : prev));
        setDetail(null);
        push(`کلاس «${confirmDelete.name}» حذف شد`, "success");
      } else if (confirmDelete.kind === "offering") {
        await apiDelete(`/offerings/${confirmDelete.id}`);
        setDetail((prev) =>
          prev ? { ...prev, offerings: prev.offerings.filter((item) => item.id !== confirmDelete.id) } : prev,
        );
        setClasses((prev) =>
          (prev || []).map((room) =>
            room.id === selected?.id
              ? { ...room, offeringCount: Math.max((room.offeringCount || 1) - 1, 0) }
              : room,
          ),
        );
        push(`درس «${confirmDelete.name}» از کلاس حذف شد`, "success");
      } else {
        // force=1 also removes the lesson's offerings; the server still refuses
        // while one of those classes is live.
        await apiDelete(`/subjects/${confirmDelete.id}?force=1`);
        setSubjects((prev) => (prev || []).filter((item) => item.id !== confirmDelete.id));
        setSubjectId("");
        setSelected((prev) => (prev ? { ...prev } : prev)); // re-fetch the class detail
        push(`درس «${confirmDelete.name}» حذف شد`, "success");
        reloadClasses();
      }
      setConfirmDelete(null);
    } catch (error) {
      push(error instanceof Error ? error.message : "حذف ناموفق بود", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function assignStudent(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!studentId) {
      push("دانش‌آموز را انتخاب کنید", "error");
      return;
    }
    setBusy(true);
    try {
      const student = (students?.items || []).find((item) => String(item.id) === String(studentId));
      await apiPost("/enrollments/assign", { student: studentId, class_room: selected.id });
      if (student) {
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                students: [
                  ...prev.students,
                  {
                    id: `new-${student.id}`,
                    student: student.id,
                    studentName: student.fullName,
                    studentUsername: student.username,
                  },
                ],
              }
            : prev,
        );
      }
      setClasses((prev) =>
        (prev || []).map((room) =>
          room.id === selected.id ? { ...room, studentCount: (room.studentCount || 0) + 1 } : room,
        ),
      );
      push("دانش‌آموز به کلاس اضافه شد", "success");
      setStudentModal(false);
      setStudentId("");
      reloadClasses();
    } catch (error) {
      push(error instanceof Error ? error.message : "افزودن دانش‌آموز ناموفق بود", "error");
    } finally {
      setBusy(false);
    }
  }

  const teacherOptions = useMemo(
    () => (teachers?.items || []).filter((teacher) => teacher.is_active !== false),
    [teachers],
  );

  const studentOptions = useMemo(
    () =>
      (students?.items || []).filter(
        (student) =>
          student.is_active !== false &&
          !detail?.students?.some((item: any) => item.student === student.id),
      ),
    [students, detail],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="مدیریت"
        title="کلاس‌ها و درس‌ها"
        subtitle="هر کلاس یک گروه دانش‌آموز دارد و هر درس با یک معلم ارائه می‌شود"
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSubjectsOpen(true)} className="btn-ghost">
              مدیریت درس‌ها
            </button>
            <button type="button" onClick={() => setSubjectModal(true)} className="btn-ghost">
              <Plus size={17} /> درس جدید
            </button>
            <button type="button" onClick={() => setClassModal(true)} className="btn-primary">
              <Plus size={17} /> کلاس جدید
            </button>
          </div>
        }
      />

      <ClassGuide />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-2">
          {loading ? (
            <SkeletonRows rows={4} />
          ) : (classes || []).length === 0 ? (
            <EmptyState
              icon={<ChalkboardTeacher size={28} />}
              title="هنوز کلاسی نیست"
              description="با «کلاس جدید» شروع کنید؛ بعد دانش‌آموز و درس اضافه کنید."
            />
          ) : (
            (classes || []).map((classroom) => {
              const active = selected?.id === classroom.id;
              return (
                <button
                  key={classroom.id}
                  type="button"
                  onClick={() => setSelected(classroom)}
                  className={`card w-full p-4 text-right transition ${
                    active ? "border-brand-500 ring-4 ring-brand-500/15" : "hover:border-brand-300"
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-ink">{classroom.name}</span>
                    <span className="chip bg-brand-50 text-brand-800">پایه {num(classroom.grade)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-3 text-[11.5px] text-ink-muted">
                    <span className="inline-flex items-center gap-1"><UsersThree size={14} /> {num(classroom.studentCount)}</span>
                    <span className="inline-flex items-center gap-1"><ChalkboardTeacher size={14} /> {num(classroom.offeringCount)} درس</span>
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <section className="space-y-4">
          {!selected ? (
            <EmptyState icon={<ChalkboardTeacher size={30} />} title="کلاسی انتخاب نشده" description="یک کلاس بسازید یا از فهرست انتخاب کنید." />
          ) : (
            <>
              <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <h2 className="text-[16px] font-semibold text-ink">{selected.name}</h2>
                  <p className="text-[12px] text-ink-muted">سال تحصیلی {selected.year}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: "class", id: selected.id, name: selected.name })}
                    className="btn-ghost text-danger hover:bg-red-50"
                  >
                    <Trash size={17} /> حذف کلاس
                  </button>
                  <button type="button" onClick={() => setStudentModal(true)} className="btn-ghost">
                    <UserPlus size={17} /> افزودن دانش‌آموز
                  </button>
                  <button type="button" onClick={() => setOfferingModal(true)} className="btn-primary">
                    <Plus size={17} /> افزودن درس
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  {(["offerings", "students"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      className={`chip border transition ${
                        tab === value ? "border-brand-600 bg-brand-600 text-white" : "border-[color:var(--line)] bg-white text-ink-soft"
                      }`}
                    >
                      {value === "offerings" ? "درس‌ها" : "دانش‌آموزان"}
                      <span className="opacity-70">
                        {num(value === "offerings" ? detail?.offerings.length || 0 : detail?.students.length || 0)}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  className="btn-ghost gap-1 px-2.5 py-1.5 text-[11.5px]"
                  title="به‌روزرسانی وضعیت برگزاری کلاس‌ها"
                >
                  <ArrowClockwise size={14} aria-hidden="true" />
                  به‌روزرسانی وضعیت
                </button>
              </div>

              {!detail ? (
                <SkeletonRows rows={4} />
              ) : tab === "offerings" ? (
                detail.offerings.length === 0 ? (
                  <EmptyState icon={<ChalkboardTeacher size={28} />} title="درسی برای این کلاس ثبت نشده" description="با دکمهٔ «افزودن درس» شروع کنید." />
                ) : (
                  <ul className="card divide-y divide-[color:var(--line)] overflow-hidden">
                    {detail.offerings.map((offering) => (
                      <li key={offering.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-10 w-10 place-items-center rounded-xl"
                            style={{ background: `${offering.subject.color}1f`, color: offering.subject.color }}
                          >
                            <SubjectIcon name={offering.subject.icon} size={19} />
                          </span>
                          <div>
                            <p className="text-[13.5px] font-medium text-ink">{offering.subject.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-muted">
                              {offering.teacher.fullName}
                              {offering.isRunning && (
                                <span className="chip bg-emerald-50 text-emerald-700">
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                                  در حال برگزاری
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {offering.isRunning && (
                            <button
                              type="button"
                              onClick={() => joinOffering(offering)}
                              disabled={joiningId === offering.id}
                              className="btn-primary gap-1 px-3 py-1.5 text-[11.5px]"
                              title="ورود به کلاس برای بررسی"
                            >
                              <PlayCircle size={15} weight="fill" aria-hidden="true" />
                              {joiningId === offering.id ? "در حال ورود…" : "ورود به کلاس"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setLinkOffering(offering)}
                            className="btn-ghost gap-1 px-3 py-1.5 text-[11.5px] text-brand-800 hover:bg-brand-50"
                            title="لینک ثابت کلاس"
                          >
                            <LinkSimple size={15} aria-hidden="true" />
                            لینک کلاس
                          </button>
                          <Link href={`/offerings/${offering.id}`} className="btn-ghost px-3 py-1.5 text-[11.5px]">جزئیات</Link>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                kind: "offering",
                                id: offering.id,
                                name: offering.subject.title,
                              })
                            }
                            className="btn-ghost px-2 py-1.5 text-[11.5px] text-danger hover:bg-red-50"
                            aria-label={`حذف درس ${offering.subject.title} از این کلاس`}
                          >
                            <Trash size={15} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              ) : detail.students.length === 0 ? (
                <EmptyState icon={<UsersThree size={28} />} title="دانش‌آموزی در این کلاس نیست" description="از دکمهٔ افزودن دانش‌آموز یا افزودن گروهی با اکسل استفاده کنید." />
              ) : (
                <ul className="card grid gap-2 p-4 sm:grid-cols-2">
                  {detail.students.map((row: any) => (
                    <li key={row.id} className="flex items-center gap-3 rounded-xl bg-brand-50/50 px-3 py-2">
                      <Avatar name={row.studentName} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] text-ink">{row.studentName}</p>
                        <p className="truncate text-[11px] text-ink-muted" dir="ltr">{row.studentUsername}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <Modal open={classModal} onClose={() => setClassModal(false)} title="کلاس جدید" size="sm">
        <form onSubmit={createClass} className="space-y-3">
          <div>
            <label className="label" htmlFor="cname">نام کلاس</label>
            <input id="cname" className="input" required value={className} onChange={(e) => setClassName(e.target.value)} placeholder="مثلاً سوم الف" />
          </div>
          <div>
            <label className="label" htmlFor="grade">پایه</label>
            <select id="grade" className="input" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>پایه {num(value)}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "در حال ساخت…" : "ساخت کلاس"}</button>
        </form>
      </Modal>

      <Modal open={offeringModal} onClose={() => setOfferingModal(false)} title="افزودن درس به کلاس" size="sm">
        <form onSubmit={addOffering} className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor="subject">درس</label>
              <button
                type="button"
                onClick={() => setShowNewSubject((value) => !value)}
                className="text-[11.5px] font-medium text-brand-700 transition hover:text-brand-900"
              >
                {showNewSubject ? "بستن" : "+ درس تازه"}
              </button>
            </div>
            <select id="subject" className="input" required value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
              <option value="">انتخاب کنید…</option>
              {(subjects || []).map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.title}</option>
              ))}
            </select>
            {(subjects || []).length === 0 && !showNewSubject && (
              <p className="mt-1.5 text-[11.5px] leading-5 text-ink-muted">
                هنوز درسی ساخته نشده؛ روی «+ درس تازه» بزنید تا همین‌جا بسازید.
              </p>
            )}
            {showNewSubject && (
              <div className="mt-2 flex gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-2">
                <input
                  className="input h-10 py-2"
                  value={newSubjectTitle}
                  onChange={(e) => setNewSubjectTitle(e.target.value)}
                  placeholder="مثلاً علوم"
                  aria-label="عنوان درس تازه"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createSubjectInline();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => createSubjectInline()}
                  disabled={creatingSubject || !newSubjectTitle.trim()}
                  className="btn-soft shrink-0 px-3 text-[12px]"
                >
                  {creatingSubject ? "…" : "افزودن"}
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="teacher">معلم</label>
            <select id="teacher" className="input" required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {(teacherOptions).map((teacher) => (
                <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
              ))}
            </select>
            {(teacherOptions).length === 0 && (
              <p className="mt-1.5 text-[11.5px] leading-5 text-ink-muted">
                معلمی ثبت نشده. اول از <Link href="/admin/users" className="font-medium text-brand-700 underline">کاربرها</Link> یک معلم بسازید.
              </p>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "در حال افزودن…" : "افزودن درس"}</button>
        </form>
      </Modal>

      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title="درس جدید" size="sm">
        <form onSubmit={createSubject} className="space-y-3">
          <div>
            <label className="label" htmlFor="stitle">عنوان درس</label>
            <input id="stitle" className="input" required value={subjectTitle} onChange={(e) => setSubjectTitle(e.target.value)} placeholder="مثلاً ریاضی" />
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "در حال ساخت…" : "ساخت درس"}</button>
        </form>
      </Modal>

      <Modal open={studentModal} onClose={() => setStudentModal(false)} title="افزودن دانش‌آموز" description="دانش‌آموز از کلاس قبلی به این کلاس منتقل می‌شود." size="sm">
        <form onSubmit={assignStudent} className="space-y-3">
          <div>
            <label className="label" htmlFor="student">دانش‌آموز</label>
            <select id="student" className="input" required value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {studentOptions.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.fullName} — {student.username}
                </option>
              ))}
            </select>
            {studentOptions.length === 0 && (
              <p className="mt-1.5 text-[11.5px] leading-5 text-ink-muted">
                دانش‌آموز آزادی نمانده. از <Link href="/admin/import" className="font-medium text-brand-700 underline">افزودن گروهی</Link> دانش‌آموز تازه بسازید.
              </p>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? "در حال افزودن…" : "افزودن به کلاس"}</button>
        </form>
      </Modal>

      <Modal
        open={subjectsOpen}
        onClose={() => setSubjectsOpen(false)}
        title="مدیریت درس‌ها"
        description="درسی که در هیچ کلاسی استفاده نشده بی‌خطر حذف می‌شود؛ حذف درسِ در حال استفاده، ارائه‌های آن را هم پاک می‌کند."
      >
        {(subjects || []).length === 0 ? (
          <EmptyState
            icon={<ChalkboardTeacher size={28} />}
            title="هنوز درسی ساخته نشده"
            description="با «درس جدید» اولین درس را بسازید."
          />
        ) : (
          <ul className="divide-y divide-[color:var(--line)]">
            {(subjects || []).map((subject) => (
              <li key={subject.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl"
                    style={{ background: `${subject.color}1f`, color: subject.color }}
                  >
                    <SubjectIcon name={subject.icon} size={18} />
                  </span>
                  <div>
                    <p className="text-[13px] font-medium text-ink">{subject.title}</p>
                    <p className="text-[11.5px] text-ink-muted">
                      {num(subject.offeringCount || 0)} ارائه
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ kind: "subject", id: subject.id, name: subject.title })}
                  className="btn-ghost px-2.5 py-1.5 text-[11.5px] text-danger hover:bg-red-50"
                >
                  <Trash size={15} /> حذف
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setSubjectsOpen(false);
              setSubjectModal(true);
            }}
            className="btn-soft"
          >
            <Plus size={16} /> درس جدید
          </button>
          <button type="button" onClick={() => setSubjectsOpen(false)} className="btn-ghost">
            بستن
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmDelete !== null}
        onClose={() => (deleting ? null : setConfirmDelete(null))}
        title={
          confirmDelete?.kind === "class"
            ? "حذف کلاس"
            : confirmDelete?.kind === "offering"
              ? "حذف درس از کلاس"
              : "حذف درس"
        }
        size="sm"
      >
        <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-6 text-red-800">
          {confirmDelete?.kind === "class" ? (
            <>
              کلاس «{confirmDelete?.name}» با همهٔ درس‌ها و ثبت‌نام‌هایش برای همیشه حذف می‌شود. این کار برگشت‌پذیر نیست.
            </>
          ) : confirmDelete?.kind === "offering" ? (
            <>
              درس «{confirmDelete?.name}» از این کلاس حذف می‌شود؛ درس اصلی و ارائهٔ آن در کلاس‌های دیگر دست‌نخورده می‌ماند.
            </>
          ) : (
            <>
              درس «{confirmDelete?.name}» حذف می‌شود
              {confirmDelete && (subjects || []).find((item) => item.id === confirmDelete.id)?.offeringCount
                ? " و ارائه‌های آن در کلاس‌ها هم پاک می‌شوند"
                : ""}
              . این کار برگشت‌پذیر نیست.
            </>
          )}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting} className="btn-ghost">
            انصراف
          </button>
          <button type="button" onClick={confirmDeleteNow} disabled={deleting} className="btn-danger">
            <Trash size={16} /> {deleting ? "در حال حذف…" : "حذف قطعی"}
          </button>
        </div>
      </Modal>

      <GuestLinkDialog offering={linkOffering} open={!!linkOffering} onClose={() => setLinkOffering(null)} />
    </div>
  );
}
