const conceptIds = [
  "c_20000000-0000-4000-8000-000000000001",
  "c_20000000-0000-4000-8000-000000000002",
];
export const demoContent = {
  format: "pmrzokbo-content",
  version: 1,
  assets: [],
  concepts: [
    { id: conceptIds[0], name: "척수손상", noahNoteId: "", externalUrl: "" },
    {
      id: conceptIds[1],
      name: "자율신경과반사",
      noahNoteId: "",
      externalUrl: "",
    },
  ],
  questions: [
    {
      id: "q_10000000-0000-4000-8000-000000000001",
      title: "척수손상 환자의 자율신경과반사",
      major: "척수",
      minor: "자율신경과반사",
      examType: "직접 만든 데모",
      year: 2026,
      originalNumber: 1,
      stem: "[학습 흐름 확인용 데모]\n상위 흉수 손상 환자에게 갑작스러운 두통과 혈압 상승이 관찰되었다. 즉시 확인해야 할 유발 요인은?",
      choices: [
        "방광 팽만",
        "비타민 결핍",
        "단순 근피로",
        "만성 탈모",
        "굴절 이상",
      ],
      correctAnswer: 1,
      explanation:
        "앱 사용법을 위한 자체 제작 데모 문항입니다. 상위 척수손상에서 자율신경과반사를 의심할 때 방광 팽만 등의 유발 요인을 평가합니다. 실제 진료와 시험 학습에는 최신 가이드라인을 확인하세요.",
      isDemo: true,
    },
    {
      id: "q_10000000-0000-4000-8000-000000000002",
      title: "신경인성 방광의 평가",
      major: "척수",
      minor: "신경인성 방광",
      examType: "직접 만든 데모",
      year: 2026,
      originalNumber: 2,
      stem: "[학습 흐름 확인용 데모]\n척수손상 후 신경인성 방광의 저장·배뇨 기능을 평가할 때 활용하는 검사는?",
      choices: [
        "시력 검사",
        "청력 검사",
        "요역동학 검사",
        "색각 검사",
        "미각 검사",
      ],
      correctAnswer: 3,
      explanation:
        "자체 제작 데모입니다. 요역동학 검사는 방광 저장·배뇨 기능 평가에 활용됩니다. 환자별 평가와 치료는 별도의 임상 판단이 필요합니다.",
      isDemo: true,
    },
  ],
  links: [
    {
      questionId: "q_10000000-0000-4000-8000-000000000001",
      conceptId: conceptIds[0],
    },
    {
      questionId: "q_10000000-0000-4000-8000-000000000001",
      conceptId: conceptIds[1],
    },
    {
      questionId: "q_10000000-0000-4000-8000-000000000002",
      conceptId: conceptIds[0],
    },
  ],
};
