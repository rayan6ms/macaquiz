import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { isSlug } from "../../lib/slug";

export const runtime = "nodejs";

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

const DATA_ROOT = path.join(process.cwd(), "src/app/lib/data/games");
const IMAGE_ROOT = path.join(process.cwd(), "public/images/games");


function formatTopicTitle(id: string) {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function readTopics(): Promise<TopicSummary[]> {
  const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const topics: TopicSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const topicId = entry.name;
    const topicDir = path.join(DATA_ROOT, topicId);
    const quizEntries = await fs.readdir(topicDir, { withFileTypes: true });
    const quizzes: TopicSummary["quizzes"] = [];

    for (const quizEntry of quizEntries) {
      if (!quizEntry.isFile() || !quizEntry.name.endsWith(".json")) continue;
      const quizPath = path.join(topicDir, quizEntry.name);
      const quizRaw = await fs.readFile(quizPath, "utf8");
      let quizData: { id?: string; title?: string; questions?: unknown[] };

      try {
        quizData = JSON.parse(quizRaw);
      } catch {
        quizData = {};
      }

      const quizId = quizEntry.name.replace(/\.json$/, "");
      const quizTitle =
        typeof quizData.title === "string" && quizData.title.trim()
          ? quizData.title.trim()
          : quizId;
      const questionCount = Array.isArray(quizData.questions)
        ? quizData.questions.length
        : 0;
      let missingImages = 0;

      if (questionCount > 0) {
        const imageDir = path.join(IMAGE_ROOT, topicId, quizId);
        for (let idx = 0; idx < questionCount; idx += 1) {
          const imagePath = path.join(imageDir, `q${idx + 1}.jpg`);
          try {
            await fs.access(imagePath);
          } catch {
            missingImages += 1;
          }
        }
      }

      quizzes.push({ id: quizId, title: quizTitle, questionCount, missingImages });
    }

    topics.push({
      id: topicId,
      title: formatTopicTitle(topicId),
      quizzes: quizzes.sort((a, b) => a.title.localeCompare(b.title)),
    });
  }

  return topics.sort((a, b) => a.title.localeCompare(b.title));
}

function isJpeg(file: File) {
  if (file.type === "image/jpeg") return true;
  const lowered = file.name.toLowerCase();
  return lowered.endsWith(".jpg") || lowered.endsWith(".jpeg");
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const topicId = reqUrl.searchParams.get("topicId");
  const quizId = reqUrl.searchParams.get("quizId");

  if (topicId && quizId) {
    const quizPath = path.join(DATA_ROOT, topicId, `${quizId}.json`);
    try {
      const quizRaw = await fs.readFile(quizPath, "utf8");
      const quizData = JSON.parse(quizRaw) as {
        id?: string;
        title?: string;
        questions?: unknown[];
      };
      return NextResponse.json({ quiz: quizData });
    } catch {
      return NextResponse.json({ error: "Quiz não encontrado." }, { status: 404 });
    }
  }

  const topics = await readTopics();
  return NextResponse.json({ topics });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const topicId = String(form.get("topicId") ?? "").trim();
  const quizId = String(form.get("quizId") ?? "").trim();
  const quizTitle = String(form.get("quizTitle") ?? "").trim();
  const quizFile = form.get("quizFile");

  if (!isSlug(topicId) || !isSlug(quizId)) {
    return NextResponse.json(
      { error: "Slug inválido para tema ou quiz." },
      { status: 400 }
    );
  }

  if (!(quizFile instanceof File)) {
    return NextResponse.json(
      { error: "Arquivo JSON ausente." },
      { status: 400 }
    );
  }

  const topicDir = path.join(DATA_ROOT, topicId);
  const quizPath = path.join(topicDir, `${quizId}.json`);

  try {
    await fs.access(quizPath);
    return NextResponse.json(
      { error: "Já existe um quiz com este nome." },
      { status: 409 }
    );
  } catch {
    // ok to create
  }

  let quizData: { title?: string; questions?: unknown[] };
  try {
    quizData = JSON.parse(await quizFile.text());
  } catch {
    return NextResponse.json(
      { error: "JSON inválido." },
      { status: 400 }
    );
  }

  if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
    return NextResponse.json(
      { error: "O JSON precisa de uma lista de perguntas." },
      { status: 400 }
    );
  }

  const imageFiles: Array<File | null> = [];

  for (let idx = 0; idx < quizData.questions.length; idx += 1) {
    const raw = quizData.questions[idx] as {
      id?: unknown;
      title?: unknown;
      options?: unknown;
      correct?: unknown;
    };

    const title = String(raw?.title ?? "").trim();
    if (!title) {
      return NextResponse.json(
        { error: `Título ausente na pergunta ${idx + 1}.` },
        { status: 400 }
      );
    }

    if (!raw?.options || typeof raw.options !== "object") {
      return NextResponse.json(
        { error: `Opções inválidas na pergunta ${idx + 1}.` },
        { status: 400 }
      );
    }

    const imageFile = form.get(`image_${idx}`);
    if (imageFile instanceof File && imageFile.size > 0) {
      if (!isJpeg(imageFile)) {
        return NextResponse.json(
          { error: `A imagem da pergunta ${idx + 1} precisa ser JPG.` },
          { status: 400 }
        );
      }
      imageFiles[idx] = imageFile;
    } else {
      imageFiles[idx] = null;
    }
  }

  const normalizedQuestions = quizData.questions.map((rawQuestion, idx) => {
    const raw = rawQuestion as {
      id?: unknown;
      title?: unknown;
      options?: Record<string, string>;
      correct?: unknown;
    };
    const entry: {
      id: string;
      title: string;
      options: Record<string, string>;
      correct: string;
      image?: string;
    } = {
      id: String(raw?.id ?? `q${idx + 1}`),
      title: String(raw?.title ?? "").trim(),
      options: raw?.options ?? {},
      correct: String(raw?.correct ?? ""),
      image: `/images/games/${topicId}/${quizId}/q${idx + 1}.jpg`,
    };

    return entry;
  });

  await fs.mkdir(topicDir, { recursive: true });

  const output = {
    ...quizData,
    id: quizId,
    title: quizTitle || (typeof quizData.title === "string" ? quizData.title : quizId),
    questions: normalizedQuestions,
  };

  await fs.writeFile(quizPath, JSON.stringify(output, null, 2));

  if (imageFiles.some(Boolean)) {
    const imageDir = path.join(IMAGE_ROOT, topicId, quizId);
    await fs.mkdir(imageDir, { recursive: true });

    for (let idx = 0; idx < imageFiles.length; idx += 1) {
      const imageFile = imageFiles[idx];
      if (!imageFile) continue;
      const targetPath = path.join(imageDir, `q${idx + 1}.jpg`);
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      await fs.writeFile(targetPath, buffer);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const form = await req.formData();
  const topicId = String(form.get("topicId") ?? "").trim();
  const quizId = String(form.get("quizId") ?? "").trim();

  if (!isSlug(topicId) || !isSlug(quizId)) {
    return NextResponse.json(
      { error: "Slug inválido para tema ou quiz." },
      { status: 400 }
    );
  }

  const quizPath = path.join(DATA_ROOT, topicId, `${quizId}.json`);
  let quizData: { questions?: unknown[] };

  try {
    const quizRaw = await fs.readFile(quizPath, "utf8");
    quizData = JSON.parse(quizRaw);
  } catch {
    return NextResponse.json(
      { error: "Quiz não encontrado." },
      { status: 404 }
    );
  }

  if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
    return NextResponse.json(
      { error: "Quiz inválido ou sem perguntas." },
      { status: 400 }
    );
  }

  const imageDir = path.join(IMAGE_ROOT, topicId, quizId);
  await fs.mkdir(imageDir, { recursive: true });

  const updatedQuestions = [];
  for (let idx = 0; idx < quizData.questions.length; idx += 1) {
    const rawQuestion = quizData.questions[idx] as {
      id?: unknown;
      title?: unknown;
      options?: Record<string, string>;
      correct?: unknown;
      image?: string;
    };
    const imageFile = form.get(`image_${idx}`);
    let nextImage = rawQuestion?.image;

    if (imageFile instanceof File && imageFile.size > 0) {
      if (!isJpeg(imageFile)) {
        return NextResponse.json(
          { error: `A imagem da pergunta ${idx + 1} precisa ser JPG.` },
          { status: 400 }
        );
      }
      const targetPath = path.join(imageDir, `q${idx + 1}.jpg`);
      nextImage = `/images/games/${topicId}/${quizId}/q${idx + 1}.jpg`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());
      await fs.writeFile(targetPath, buffer);
    }

    if (nextImage) {
      nextImage = `/images/games/${topicId}/${quizId}/q${idx + 1}.jpg`;
    }

    updatedQuestions.push({
      ...rawQuestion,
      image: nextImage,
    });
  }

  const output = {
    ...quizData,
    questions: updatedQuestions,
  };

  await fs.writeFile(quizPath, JSON.stringify(output, null, 2));
  return NextResponse.json({ ok: true });
}
