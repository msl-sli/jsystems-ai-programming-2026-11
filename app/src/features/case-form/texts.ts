/** Polish UI strings of the case form that are not owned by domain constants. */
export const FORM_TEXTS = {
  title: "Zgłoś reklamację lub zwrot",
  intro:
    "Opisz problem ze sprzętem i dodaj zdjęcie. Na tej podstawie przygotujemy wstępną decyzję serwisową.",
  caseTypeLabel: "Rodzaj zgłoszenia",
  categoryLabel: "Kategoria sprzętu",
  categoryPlaceholder: "Wybierz kategorię",
  productNameLabel: "Nazwa lub model sprzętu",
  productNamePlaceholder: "np. Dell XPS 13",
  purchaseDateLabel: "Data zakupu",
  purchaseDatePlaceholder: "dd.mm.rrrr",
  purchaseDateHelp: "Wpisz datę lub wybierz ją z kalendarza.",
  openCalendar: "Otwórz kalendarz",
  photoLabel: "Zdjęcie sprzętu",
  submit: "Wyślij zgłoszenie",
  retry: "Spróbuj ponownie",
  chooseFile: "Wybierz plik",
  changeFile: "Zmień",
  removeFile: "Usuń",
  dropHint:
    "Przeciągnij zdjęcie tutaj albo wybierz plik (JPG, PNG, WEBP, do 10 MB).",
  thumbnailAlt: (name: string) => `Podgląd zdjęcia: ${name}`,
} as const;
