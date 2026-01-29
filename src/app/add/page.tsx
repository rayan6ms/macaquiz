"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FiImage } from "react-icons/fi";
import QuestionImage from "../components/QuestionImage";
import { isSlug, slugify } from "../lib/slug";

type TopicSummary = {
  id: string;
  title: string;
  quizzes: {
    id: string;
    title: string;
    questionCount: number;
    missingImages: number;
  }[];
};

type ParsedQuestion = {
  id: string;
  title: string;
  options: Record<string, string>;
  correct: string;
  image?: string;
};

type ParsedQuiz = {
  title?: string;
  questions: ParsedQuestion[];
};

const steps = ["Tema", "Quiz", "Imagens"];
const TOPICS_PER_PAGE = 8;
const QUIZZES_PER_PAGE = 8;

function isJpeg(file: File) {
  if (file.type === "image/jpeg") return true;
  const lowered = file.name.toLowerCase();
  return lowered.endsWith(".jpg") || lowered.endsWith(".jpeg");
}

export default function AddPage() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(true);
  const [step, setStep] = useState(0);

  const [topicDraft, setTopicDraft] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<{
    id: string;
    isNew: boolean;
  } | null>(null);
  const [topicsPage, setTopicsPage] = useState(0);
  const [quizzesPage, setQuizzesPage] = useState(0);

  const [quizMode, setQuizMode] = useState<"new" | "existing">("new");
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);

  const [quizDraft, setQuizDraft] = useState("");
  const [quizTitle, setQuizTitle] = useState("");
  const [quizFile, setQuizFile] = useState<File | null>(null);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizData, setQuizData] = useState<ParsedQuiz | null>(null);

  const [imageFiles, setImageFiles] = useState<Array<File | null>>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const previewsRef = useRef<string[]>([]);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>(
    {}
  );

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const topicSlug = useMemo(() => slugify(topicDraft), [topicDraft]);
  const topicDuplicate = useMemo(
    () => topics.some((topic) => topic.id === topicSlug),
    [topics, topicSlug]
  );
  const topicNameOk = useMemo(() => topicDraft.trim().length > 3, [topicDraft]);
  const topicSlugOk = useMemo(() => isSlug(topicSlug), [topicSlug]);

  const quizSlug = useMemo(() => slugify(quizDraft), [quizDraft]);
  const quizNameOk = useMemo(() => quizDraft.trim().length > 3, [quizDraft]);
  const quizSlugOk = useMemo(() => isSlug(quizSlug), [quizSlug]);
  const quizDuplicate = useMemo(() => {
    if (!selectedTopic) return false;
    const topic = topics.find((t) => t.id === selectedTopic.id);
    if (!topic) return false;
    return topic.quizzes.some((q) => q.id === quizSlug);
  }, [topics, quizSlug, selectedTopic]);

  useEffect(() => {
    let active = true;

    async function loadTopics() {
      setIsLoadingTopics(true);
      setTopicsError(null);
      try {
        const res = await fetch("/api/quiz-builder");
        if (!res.ok) throw new Error("Falha ao carregar temas.");
        const data = (await res.json()) as { topics: TopicSummary[] };
        if (active) setTopics(data.topics ?? []);
      } catch (err) {
        if (active) setTopicsError("Não foi possível carregar os temas.");
      } finally {
        if (active) setIsLoadingTopics(false);
      }
    }

    loadTopics();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    previewsRef.current = imagePreviews;
  }, [imagePreviews]);

  useEffect(() => {
    setTopicsPage(0);
  }, [topics.length]);

  useEffect(() => {
    setQuizzesPage(0);
  }, [selectedTopic?.id]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function clearPreviews() {
    previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewsRef.current = [];
    setImagePreviews([]);
  }

  function selectExistingTopic(topicId: string) {
    setSelectedTopic({ id: topicId, isNew: false });
    setQuizzesPage(0);
    setSaveSuccess(null);
    setQuizMode("existing");
    setSelectedQuizId(null);
    setQuizDraft("");
    setQuizTitle("");
    setQuizFile(null);
    setQuizData(null);
    setRevealedAnswers({});
    setImageFiles([]);
    clearPreviews();
  }

  function useNewTopic() {
    if (!topicNameOk || !topicSlugOk || topicDuplicate) return;
    setSelectedTopic({ id: topicSlug, isNew: true });
    setQuizzesPage(0);
    setSaveSuccess(null);
    setQuizMode("new");
    setSelectedQuizId(null);
    setQuizDraft("");
    setQuizTitle("");
    setQuizFile(null);
    setQuizData(null);
    setRevealedAnswers({});
    setImageFiles([]);
    clearPreviews();
  }

  async function loadExistingQuiz(quizId: string) {
    if (!selectedTopic) return;
    setIsLoadingQuiz(true);
    setQuizError(null);
    try {
      const res = await fetch(
        `/api/quiz-builder?topicId=${selectedTopic.id}&quizId=${quizId}`
      );
      if (!res.ok) throw new Error("Falha ao carregar quiz.");
      const data = (await res.json()) as { quiz?: ParsedQuiz };
      if (!data.quiz || !Array.isArray(data.quiz.questions)) {
        throw new Error("Quiz inválido.");
      }
      setSelectedQuizId(quizId);
      setQuizDraft(quizId);
      setQuizTitle(String(data.quiz.title ?? ""));
      setQuizData({
        title: data.quiz.title,
        questions: data.quiz.questions.map((question, idx) => ({
          id: String(question?.id ?? `q${idx + 1}`),
          title: String(question?.title ?? ""),
          options: (question as ParsedQuestion).options ?? {},
          correct: String((question as ParsedQuestion).correct ?? ""),
          image: (question as ParsedQuestion).image,
        })),
      });
      setRevealedAnswers({});
      setImageFiles(new Array(data.quiz.questions.length).fill(null));
      clearPreviews();
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "Falha ao carregar quiz.");
    } finally {
      setIsLoadingQuiz(false);
    }
  }

  async function handleQuizFile(file: File | null) {
    setQuizMode("new");
    setQuizFile(file);
    setQuizError(null);
    setQuizData(null);
    setRevealedAnswers({});
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ParsedQuiz;
      if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setQuizError("O JSON precisa de uma lista de perguntas.");
        return;
      }

      const normalized = parsed.questions.map((question, idx) => {
        const id = String(question?.id ?? `q${idx + 1}`);
        const title = String(question?.title ?? "").trim();
        if (!title) throw new Error(`Título ausente na pergunta ${idx + 1}.`);
        if (!question?.options || typeof question.options !== "object") {
          throw new Error(`Opções inválidas na pergunta ${idx + 1}.`);
        }
        return {
          id,
          title,
          options: question.options ?? {},
          correct: String(question?.correct ?? ""),
        };
      });

      setQuizData({ title: parsed.title, questions: normalized });
      setRevealedAnswers({});
      setImageFiles(new Array(normalized.length).fill(null));
      clearPreviews();
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : "JSON inválido ou incompleto.");
    }
  }

  function setQuestionImage(index: number, file: File | null) {
    setSaveSuccess(null);
    setSaveError(null);
    setImageFiles((prev) => {
      const next = [...prev];
      next[index] = file;
      return next;
    });
    setImagePreviews((prev) => {
      const next = [...prev];
      if (next[index]) URL.revokeObjectURL(next[index]);
      next[index] = file ? URL.createObjectURL(file) : "";
      return next;
    });
  }

  async function handleSave() {
    if (
      !selectedTopic ||
      !quizData ||
      (!quizSlug && quizMode === "new") ||
      (quizMode === "new" && (!quizFile || !quizSlugOk || quizDuplicate))
    ) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const form = new FormData();
      form.append("topicId", selectedTopic.id);
      const quizId = quizMode === "existing" ? selectedQuizId : quizSlug;
      if (!quizId) throw new Error("Quiz inválido.");
      form.append("quizId", quizId);
      if (quizMode === "new") {
        if (quizTitle.trim()) form.append("quizTitle", quizTitle.trim());
        if (quizFile) form.append("quizFile", quizFile);
      }

      imageFiles.forEach((file, idx) => {
        if (file) form.append(`image_${idx}`, file);
      });

      const res = await fetch("/api/quiz-builder", {
        method: quizMode === "new" ? "POST" : "PUT",
        body: form,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSaveError(data?.error ?? "Falha ao salvar o quiz.");
        return;
      }

      setSaveSuccess("Quiz salvo com sucesso.");
      setStep(0);
      setTopicDraft("");
      setSelectedTopic(null);
      setQuizMode("new");
      setSelectedQuizId(null);
      setQuizDraft("");
      setQuizTitle("");
      setQuizFile(null);
      setQuizData(null);
      setRevealedAnswers({});
      setImageFiles([]);
      clearPreviews();

      const refreshed = await fetch("/api/quiz-builder");
      if (refreshed.ok) {
        const data = (await refreshed.json()) as { topics: TopicSummary[] };
        setTopics(data.topics ?? []);
      }
    } catch (err) {
      setSaveError("Falha ao salvar o quiz.");
    } finally {
      setIsSaving(false);
    }
  }

  const canAdvanceTopic =
    Boolean(selectedTopic) ||
    (topicNameOk && topicSlugOk && !topicDuplicate && topicSlug);
  const canAdvanceQuiz =
    quizMode === "new"
      ? Boolean(quizData) &&
        Boolean(quizFile) &&
        quizNameOk &&
        quizSlugOk &&
        !quizDuplicate
      : Boolean(quizData) && Boolean(selectedQuizId);

  const currentTopic = selectedTopic
    ? topics.find((t) => t.id === selectedTopic.id) ?? null
    : null;

  const topicsPageCount = Math.max(
    1,
    Math.ceil(topics.length / TOPICS_PER_PAGE)
  );
  const topicsPageSafe = Math.min(topicsPage, topicsPageCount - 1);
  const pagedTopics = topics.slice(
    topicsPageSafe * TOPICS_PER_PAGE,
    (topicsPageSafe + 1) * TOPICS_PER_PAGE
  );

  const quizzes = currentTopic?.quizzes ?? [];
  const quizzesPageCount = Math.max(
    1,
    Math.ceil(quizzes.length / QUIZZES_PER_PAGE)
  );
  const quizzesPageSafe = Math.min(quizzesPage, quizzesPageCount - 1);
  const pagedQuizzes = quizzes.slice(
    quizzesPageSafe * QUIZZES_PER_PAGE,
    (quizzesPageSafe + 1) * QUIZZES_PER_PAGE
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 p-4 sm:p-8 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <div className="text-sm opacity-70">Criador de quizzes</div>
          <div className="text-3xl font-semibold">Adicionar novo quiz</div>
          <div className="mt-2 text-sm opacity-70">
            Configure o tema, envie o JSON e associe imagens para cada pergunta.
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {steps.map((label, idx) => (
            <div
              key={label}
              className={[
                "rounded-full px-4 py-1 text-sm font-semibold",
                idx === step ? "bg-white/20" : "bg-black/30 opacity-70",
              ].join(" ")}
            >
              {idx + 1}. {label}
            </div>
          ))}
        </div>

        {saveSuccess && (
          <div className="mb-4 rounded-2xl bg-emerald-500/15 p-4 text-emerald-100">
            {saveSuccess}
          </div>
        )}

        {step === 0 && (
          <section className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <div className="text-xl font-semibold">Escolha ou crie um tema</div>
            <div className="mt-2 text-sm opacity-80">
              Selecione um tema existente ou crie um novo usando um nome com
              mais de 3 caracteres.
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm opacity-70">Novo tema</div>
                <input
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  placeholder="Ex.: Conhecimentos gerais"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                />
                <div className="mt-2 text-xs opacity-70">
                  Slug: <span className="font-semibold">{topicSlug || "—"}</span>
                </div>
                {topicDuplicate && (
                  <div className="mt-2 text-xs text-rose-200">
                    Já existe um tema com este slug.
                  </div>
                )}
                {!topicSlugOk && topicDraft.trim() && (
                  <div className="mt-2 text-xs text-rose-200">
                    O slug precisa usar apenas letras, números e hífens.
                  </div>
                )}
                <button
                  type="button"
                  onClick={useNewTopic}
                  disabled={!topicNameOk || !topicSlugOk || topicDuplicate}
                  className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40 transition"
                >
                  Usar este tema
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm opacity-70">Temas existentes</div>
                {isLoadingTopics ? (
                  <div className="mt-3 text-sm opacity-80">Carregando…</div>
                ) : topicsError ? (
                  <div className="mt-3 text-sm text-rose-200">{topicsError}</div>
                ) : (
                  <>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {pagedTopics.map((topic) => {
                        const missingImages = topic.quizzes.reduce(
                          (sum, quiz) => sum + quiz.missingImages,
                          0
                        );
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => selectExistingTopic(topic.id)}
                            className={[
                              "rounded-xl border px-3 py-2 text-left text-sm transition",
                              selectedTopic?.id === topic.id
                                ? "border-emerald-300/70 bg-emerald-500/20"
                                : "border-white/10 bg-white/5 hover:border-white/20",
                            ].join(" ")}
                          >
                            <div className="font-semibold">{topic.title}</div>
                            <div className="text-xs opacity-70">
                              {topic.quizzes.length} quizzes
                            </div>
                            <div className="text-xs opacity-70">
                              {missingImages === 0
                                ? "Imagens completas ✅"
                                : `Imagens faltando: ${missingImages} 🖼️`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {topicsPageCount > 1 && (
                      <div className="mt-4 flex items-center justify-between text-xs opacity-80">
                        <button
                          type="button"
                          onClick={() =>
                            setTopicsPage((prev) => Math.max(0, prev - 1))
                          }
                          disabled={topicsPageSafe === 0}
                          className="rounded-lg bg-white/10 px-3 py-1 font-semibold hover:bg-white/20 disabled:opacity-40 transition"
                        >
                          ← Anterior
                        </button>
                        <div>
                          Página {topicsPageSafe + 1} de {topicsPageCount}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTopicsPage((prev) =>
                              Math.min(topicsPageCount - 1, prev + 1)
                            )
                          }
                          disabled={topicsPageSafe >= topicsPageCount - 1}
                          className="rounded-lg bg-white/10 px-3 py-1 font-semibold hover:bg-white/20 disabled:opacity-40 transition"
                        >
                          Próxima →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm opacity-70">
                {selectedTopic ? (
                  <>
                    Selecionado:{" "}
                    <span className="font-semibold">{selectedTopic.id}</span>
                  </>
                ) : (
                  "Selecione um tema para continuar."
                )}
              </div>
              <button
                type="button"
                disabled={!canAdvanceTopic}
                onClick={() => {
                  if (!selectedTopic && topicNameOk && topicSlugOk && !topicDuplicate) {
                    setSelectedTopic({ id: topicSlug, isNew: true });
                  }
                  setStep(1);
                }}
                className="rounded-xl bg-emerald-500/30 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/40 disabled:opacity-40 transition"
              >
                Próximo →
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <div className="text-xl font-semibold">Defina o quiz e envie o JSON</div>
            <div className="mt-2 text-sm opacity-80">
              Escolha um nome único e carregue o arquivo com as perguntas.
            </div>

            <div
              className={[
                "mt-5 grid gap-4",
                quizMode === "existing" ? "" : "lg:grid-cols-[1.1fr_1fr]",
              ].join(" ")}
            >
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQuizMode("new");
                      setSelectedQuizId(null);
                      setQuizDraft("");
                      setQuizTitle("");
                      setQuizFile(null);
                      setQuizData(null);
                      setRevealedAnswers({});
                      setImageFiles([]);
                      clearPreviews();
                    }}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      quizMode === "new"
                        ? "bg-emerald-500/30"
                        : "bg-white/10 hover:bg-white/20",
                    ].join(" ")}
                  >
                    Novo quiz
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuizMode("existing");
                      setSelectedQuizId(null);
                      setQuizDraft("");
                      setQuizTitle("");
                      setQuizFile(null);
                      setQuizData(null);
                      setRevealedAnswers({});
                      setImageFiles([]);
                      clearPreviews();
                    }}
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold transition",
                      quizMode === "existing"
                        ? "bg-emerald-500/30"
                        : "bg-white/10 hover:bg-white/20",
                    ].join(" ")}
                  >
                    Quiz existente
                  </button>
                </div>

                {quizMode === "existing" ? (
                  <>
                    <div className="text-sm opacity-70">Selecione um quiz</div>
                    {currentTopic && currentTopic.quizzes.length > 0 ? (
                      <>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {pagedQuizzes.map((quiz) => {
                            const imageCount =
                              quiz.questionCount - quiz.missingImages;
                            return (
                              <button
                                key={quiz.id}
                                type="button"
                                onClick={() => loadExistingQuiz(quiz.id)}
                                className={[
                                  "rounded-xl border px-3 py-2 text-left text-sm transition",
                                  selectedQuizId === quiz.id
                                    ? "border-emerald-300/70 bg-emerald-500/20"
                                    : "border-white/10 bg-white/5 hover:border-white/20",
                                ].join(" ")}
                              >
                                <div className="font-semibold">{quiz.title}</div>
                                <div className="text-xs opacity-70">
                                  {quiz.questionCount} perguntas
                                </div>
                                <div className="text-xs opacity-70">
                                  [{imageCount}/{quiz.questionCount}] imagens
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {quizzesPageCount > 1 && (
                          <div className="mt-4 flex items-center justify-between text-xs opacity-80">
                            <button
                              type="button"
                              onClick={() =>
                                setQuizzesPage((prev) => Math.max(0, prev - 1))
                              }
                              disabled={quizzesPageSafe === 0}
                              className="rounded-lg bg-white/10 px-3 py-1 font-semibold hover:bg-white/20 disabled:opacity-40 transition"
                            >
                              ← Anterior
                            </button>
                            <div>
                              Página {quizzesPageSafe + 1} de {quizzesPageCount}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setQuizzesPage((prev) =>
                                  Math.min(quizzesPageCount - 1, prev + 1)
                                )
                              }
                              disabled={quizzesPageSafe >= quizzesPageCount - 1}
                              className="rounded-lg bg-white/10 px-3 py-1 font-semibold hover:bg-white/20 disabled:opacity-40 transition"
                            >
                              Próxima →
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="mt-3 text-sm opacity-70">
                        Nenhum quiz disponível neste tema.
                      </div>
                    )}
                    {isLoadingQuiz && (
                      <div className="mt-3 text-sm opacity-70">
                        Carregando quiz...
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-sm opacity-70">Nome do quiz</div>
                    <input
                      value={quizDraft}
                      onChange={(e) => setQuizDraft(e.target.value)}
                      placeholder="Ex.: Quiz 6"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                    <div className="mt-2 text-xs opacity-70">
                      Slug: <span className="font-semibold">{quizSlug || "—"}</span>
                    </div>
                    {quizDuplicate && (
                      <div className="mt-2 text-xs text-rose-200">
                        Já existe um quiz com este nome neste tema.
                      </div>
                    )}
                    {!quizSlugOk && quizDraft.trim() && (
                      <div className="mt-2 text-xs text-rose-200">
                        O slug precisa usar apenas letras, números e hífens.
                      </div>
                    )}
                    <div className="mt-4 text-sm opacity-70">
                      Título (opcional)
                    </div>
                    <input
                      value={quizTitle}
                      onChange={(e) => setQuizTitle(e.target.value)}
                      placeholder="Texto que aparece para os jogadores"
                      className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                    />
                    <div className="mt-4 text-sm opacity-70">Arquivo JSON</div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="quiz-json-file"
                        className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/20"
                      >
                        Selecionar arquivo
                      </label>
                      <input
                        id="quiz-json-file"
                        type="file"
                        accept="application/json"
                        onChange={(e) => handleQuizFile(e.target.files?.[0] ?? null)}
                        className="hidden"
                      />
                      <div className="text-xs opacity-70">
                        {quizFile ? quizFile.name : "Nenhum arquivo selecionado"}
                      </div>
                    </div>
                  </>
                )}
                {quizError && (
                  <div className="mt-2 text-xs text-rose-200">{quizError}</div>
                )}
              </div>
              {quizMode !== "existing" && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="text-sm opacity-70">Prévia do JSON</div>
                  {quizData ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <div>
                        <span className="opacity-70">Título:</span>{" "}
                        <span className="font-semibold">
                          {quizData.title ||
                            quizTitle ||
                            selectedQuizId ||
                            quizSlug}
                        </span>
                      </div>
                      <div>
                        <span className="opacity-70">Perguntas:</span>{" "}
                        <span className="font-semibold">
                          {quizData.questions.length}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 text-sm opacity-70">
                      Nenhum JSON carregado ainda.
                    </div>
                  )}

                  {currentTopic && (
                    <div className="mt-4 text-xs opacity-70">
                      Tema atual:{" "}
                      <span className="font-semibold">
                        {currentTopic.title}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {quizMode === "existing" && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-sm opacity-70">Prévia do JSON</div>
                {quizData ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div>
                      <span className="opacity-70">Título:</span>{" "}
                      <span className="font-semibold">
                        {quizData.title || quizTitle || selectedQuizId || quizSlug}
                      </span>
                    </div>
                    <div>
                      <span className="opacity-70">Perguntas:</span>{" "}
                      <span className="font-semibold">
                        {quizData.questions.length}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-sm opacity-70">
                    Nenhum JSON carregado ainda.
                  </div>
                )}

                {currentTopic && (
                  <div className="mt-4 text-xs opacity-70">
                    Tema atual:{" "}
                    <span className="font-semibold">{currentTopic.title}</span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 transition"
              >
                ← Voltar
              </button>
              <button
                type="button"
                disabled={!canAdvanceQuiz}
                onClick={() => setStep(2)}
                className="rounded-xl bg-emerald-500/30 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/40 disabled:opacity-40 transition"
              >
                Próximo →
              </button>
            </div>
          </section>
        )}

        {step === 2 && quizData && (
          <section className="rounded-3xl bg-white/10 p-6 backdrop-blur">
            <div className="text-xl font-semibold">
              Escolha as imagens das perguntas
            </div>
            <div className="mt-2 text-sm opacity-80">
              Imagens JPG serão salvas como q1.jpg, q2.jpg e assim por diante.
            </div>

            <div className="mt-5 grid gap-4">
              {quizData.questions.map((question, idx) => {
                const preview = imagePreviews[idx];
                const existingImage = question.image;
                const isAnswerRevealed = Boolean(revealedAnswers[question.id]);
                const selectedImageName = imageFiles[idx]?.name ?? null;
                return (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm opacity-70">
                          Pergunta {idx + 1} • {question.id}
                        </div>
                        <div className="text-lg font-semibold">{question.title}</div>
                        <div className="text-xs opacity-70">
                          Arquivo: q{idx + 1}.jpg
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                      {Object.entries(question.options).map(([key, value]) => (
                        <div
                          key={key}
                          className={[
                            "rounded-xl border px-3 py-2 text-xs",
                            key === question.correct && isAnswerRevealed
                              ? "border-emerald-300/70 bg-emerald-500/20"
                              : "border-white/10 bg-white/5",
                          ].join(" ")}
                        >
                          <div className="font-semibold">{key}</div>
                          <div className="opacity-80">{value}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <label
                          htmlFor={`question-image-${idx}`}
                          className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold transition hover:bg-white/20"
                        >
                          Buscar imagem
                        </label>
                        <input
                          id={`question-image-${idx}`}
                          type="file"
                          accept="image/jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (file && !isJpeg(file)) {
                              setSaveError(
                                `A imagem da pergunta ${idx + 1} precisa ser JPG.`
                              );
                              return;
                            }
                            setQuestionImage(idx, file);
                          }}
                          className="hidden"
                        />
                        <div
                          className="max-w-[220px] truncate text-xs opacity-70"
                          title={selectedImageName ?? undefined}
                        >
                          {selectedImageName ?? "Nenhum arquivo selecionado"}
                        </div>
                      </div>
                      <QuestionImage
                        src={preview || existingImage}
                        alt=""
                        className="h-20 w-32 rounded-xl object-cover"
                        placeholderLabel="Imagem ausente"
                        placeholderIcon={<FiImage className="h-6 w-6 text-white/80" />}
                        placeholderClassName="bg-gradient-to-br from-sky-500/30 via-blue-500/20 to-slate-950/20 text-white/80 border-sky-200/20"
                      />
                      {imageFiles[idx] && (
                        <button
                          type="button"
                          onClick={() => setQuestionImage(idx, null)}
                          className="rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20 transition"
                        >
                          Remover imagem
                        </button>
                      )}
                      {existingImage && imageFiles[idx] && (
                        <div className="text-xs text-amber-200">
                          Esta imagem será sobrescrita.
                        </div>
                      )}
                      {!existingImage && !imageFiles[idx] && (
                        <div className="text-xs opacity-70">Sem imagem.</div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isAnswerRevealed && (
                        <div className="text-xs text-emerald-200">
                          Resposta correta:{" "}
                          <span className="font-semibold">{question.correct}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedAnswers((prev) => ({
                            ...prev,
                            [question.id]: !prev[question.id],
                          }))
                        }
                        className="ml-auto rounded-xl bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20 transition"
                      >
                        {isAnswerRevealed ? "Ocultar resposta" : "Mostrar resposta"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {saveError && (
              <div className="mt-4 rounded-2xl bg-rose-500/15 p-4 text-rose-100">
                {saveError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 transition"
              >
                ← Voltar
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSave}
                className="rounded-xl bg-emerald-500/30 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/40 disabled:opacity-40 transition"
              >
                {isSaving ? "Salvando…" : "Salvar quiz"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
