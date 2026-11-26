import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaseForm } from "./case-form";
import { exampleImage, installDomStubs, memoryFile } from "./test-helpers";

const TODAY = "2026-11-26";
const NAME_MESSAGE = "Podaj nazwę lub model sprzętu (2–100 znaków).";
const COMPLAINT_MESSAGE = "Opisz problem (20–2000 znaków).";
const LONG_DESCRIPTION = "Ekran przestaje reagować po kilku minutach pracy.";

let stubs: ReturnType<typeof installDomStubs>;

beforeEach(() => {
  stubs = installDomStubs();
});

function setup(props: Partial<React.ComponentProps<typeof CaseForm>> = {}) {
  const onSubmit = vi.fn();
  const user = userEvent.setup({ applyAccept: false });
  render(<CaseForm onSubmit={onSubmit} today={TODAY} {...props} />);
  return { user, onSubmit };
}

const radio = (name: string) => screen.getByRole("radio", { name });
const categorySelect = () =>
  screen.getByRole("combobox", { name: "Kategoria sprzętu" });
const nameInput = () => screen.getByLabelText("Nazwa lub model sprzętu");
const dateInput = () => screen.getByLabelText("Data zakupu");
const description = () => screen.getByLabelText(/^Powód \/ opis problemu/);
const photoInput = () =>
  screen.getByLabelText("Zdjęcie sprzętu") as HTMLInputElement;
const submitButton = () =>
  screen.getByRole("button", { name: "Wyślij zgłoszenie" });

/** Focus, edit and leave a field like a user would (validation runs on blur). */
async function edit(
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string,
) {
  await user.click(field);
  fireEvent.change(field, { target: { value } });
  await user.tab();
}

async function chooseCategory(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await user.click(categorySelect());
  await user.click(await screen.findByRole("option", { name: label }));
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.click(radio("Reklamacja"));
  await chooseCategory(user, "Laptop");
  await user.type(nameInput(), "Dell XPS 13");
  await user.type(dateInput(), "20.11.2026");
  await user.type(description(), LONG_DESCRIPTION);
  await user.upload(photoInput(), exampleImage("laptop-1.png"));
  await screen.findByRole("button", { name: "Usuń" });
}

describe("CaseForm fields (AC-01..AC-03, AC-40, AC-42)", () => {
  it("renders the title, intro and exactly the six fields in PRD order, all with visible labels", () => {
    setup();
    expect(
      screen.getByRole("heading", { name: "Zgłoś reklamację lub zwrot" }),
    ).toBeInTheDocument();

    const ordered = [
      screen.getByText("Rodzaj zgłoszenia"),
      screen.getByText("Kategoria sprzętu"),
      screen.getByText("Nazwa lub model sprzętu"),
      screen.getByText("Data zakupu"),
      screen.getByText(/^Powód \/ opis problemu/),
      screen.getByText("Zdjęcie sprzętu"),
    ];
    for (let i = 1; i < ordered.length; i += 1) {
      expect(
        ordered[i - 1]!.compareDocumentPosition(ordered[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(
      screen.getByRole("radiogroup", { name: "Rodzaj zgłoszenia" }),
    ).toBeInTheDocument();
    expect(categorySelect()).toBeInTheDocument();
    expect(nameInput()).toBeInTheDocument();
    expect(dateInput()).toBeInTheDocument();
    expect(description()).toBeInTheDocument();
    expect(photoInput()).toBeInTheDocument();
  });

  it("offers exactly the two case types with none selected (AC-02)", () => {
    setup();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(radio("Reklamacja")).not.toBeChecked();
    expect(radio("Zwrot")).not.toBeChecked();
  });

  it("offers exactly the eight categories with none selected (AC-03)", async () => {
    const { user } = setup();
    expect(categorySelect()).toHaveTextContent("Wybierz kategorię");
    await user.click(categorySelect());
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "Laptop",
      "Smartfon",
      "Tablet",
      "Monitor",
      "Telewizor",
      "Słuchawki / audio",
      "Konsola do gier",
      "Inne",
    ]);
  });

  it("starts with empty text fields and a neutral description label", () => {
    setup();
    expect(nameInput()).toHaveValue("");
    expect(dateInput()).toHaveValue("");
    expect(description()).toHaveValue("");
    expect(screen.getByText("Powód / opis problemu")).toBeInTheDocument();
    expect(screen.getByText("0 / 2000")).toBeInTheDocument();
  });

  it("shows the live character counter", async () => {
    const { user } = setup();
    await user.type(description(), "abcde");
    expect(screen.getByText("5 / 2000")).toBeInTheDocument();
  });
});

describe("CaseForm validation messages (AC-04..AC-07)", () => {
  it("rejects too short, too long and whitespace-only names after leaving the field (AC-04)", async () => {
    const { user } = setup();
    await user.type(nameInput(), "A");
    await user.tab();
    expect(await screen.findByText(NAME_MESSAGE)).toBeInTheDocument();
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(nameInput().getAttribute("aria-describedby")).toBeTruthy();

    await user.clear(nameInput());
    await user.type(nameInput(), "   ");
    await user.tab();
    expect(await screen.findByText(NAME_MESSAGE)).toBeInTheDocument();

    fireEvent.change(nameInput(), { target: { value: "x".repeat(101) } });
    fireEvent.blur(nameInput());
    expect(await screen.findByText(NAME_MESSAGE)).toBeInTheDocument();

    fireEvent.change(nameInput(), { target: { value: "x".repeat(100) } });
    fireEvent.blur(nameInput());
    await waitFor(() =>
      expect(screen.queryByText(NAME_MESSAGE)).not.toBeInTheDocument(),
    );
  });

  it("rejects a future purchase date and one older than 10 years, accepts the boundaries (AC-05)", async () => {
    const { user } = setup();
    await user.type(dateInput(), "27.11.2026");
    await user.tab();
    expect(
      await screen.findByText("Data zakupu nie może być z przyszłości."),
    ).toBeInTheDocument();

    await user.clear(dateInput());
    await user.type(dateInput(), "25.11.2016");
    await user.tab();
    expect(
      await screen.findByText("Podaj datę zakupu z ostatnich 10 lat."),
    ).toBeInTheDocument();

    await user.clear(dateInput());
    await user.type(dateInput(), "26.11.2016");
    await user.tab();
    await waitFor(() =>
      expect(dateInput()).not.toHaveAttribute("aria-invalid", "true"),
    );

    await user.clear(dateInput());
    await user.type(dateInput(), "2026-11-26");
    await user.tab();
    await waitFor(() =>
      expect(dateInput()).not.toHaveAttribute("aria-invalid", "true"),
    );

    await user.clear(dateInput());
    await user.type(dateInput(), "31.02.2026");
    await user.tab();
    expect(await screen.findByText("Podaj datę zakupu.")).toBeInTheDocument();
  });

  it("disables calendar days outside the allowed range and fills the field from a pick", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Otwórz kalendarz" }));
    const future = await waitFor(() => {
      const cell = document.querySelector('[data-day="2026-11-27"]');
      if (!cell) throw new Error("calendar not rendered");
      return cell;
    });
    expect(within(future as HTMLElement).getByRole("button")).toBeDisabled();
    const pickable = document.querySelector(
      '[data-day="2026-11-20"]',
    ) as HTMLElement;
    await user.click(within(pickable).getByRole("button"));
    expect(dateInput()).toHaveValue("20.11.2026");
  });

  it("requires 20-2000 characters for a complaint and marks the label required (AC-06)", async () => {
    const { user } = setup();
    await user.click(radio("Reklamacja"));
    expect(
      screen.getByText("Powód / opis problemu (wymagane)"),
    ).toBeInTheDocument();

    await edit(user, description(), "a".repeat(19));
    expect(await screen.findByText(COMPLAINT_MESSAGE)).toBeInTheDocument();

    fireEvent.change(description(), { target: { value: "a".repeat(20) } });
    await waitFor(() =>
      expect(screen.queryByText(COMPLAINT_MESSAGE)).not.toBeInTheDocument(),
    );

    fireEvent.change(description(), { target: { value: "a".repeat(2001) } });
    expect(await screen.findByText(COMPLAINT_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("2001 / 2000")).toBeInTheDocument();
  });

  it("makes the description optional but capped at 2000 for a return (AC-07)", async () => {
    const { user } = setup();
    await user.click(radio("Zwrot"));
    expect(
      screen.getByText("Powód / opis problemu (opcjonalne)"),
    ).toBeInTheDocument();

    await user.click(description());
    await user.tab();
    await waitFor(() =>
      expect(description()).not.toHaveAttribute("aria-invalid", "true"),
    );

    await edit(user, description(), "a".repeat(2001));
    expect(
      await screen.findByText("Opis może mieć maksymalnie 2000 znaków."),
    ).toBeInTheDocument();
  });
});

describe("Photo field (AC-08..AC-10)", () => {
  it("accepts a JPEG that is named .png and shows thumbnail, file name, Zmień and Usuń (AC-09)", async () => {
    const { user } = setup();
    await user.upload(photoInput(), exampleImage("laptop-1.png"));
    expect(
      await screen.findByRole("img", { name: /laptop-1\.png/ }),
    ).toHaveAttribute("src", "blob:mock-1");
    expect(screen.getByText("laptop-1.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zmień" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Usuń" })).toBeInTheDocument();
  });

  it("accepts a WEBP file", async () => {
    const { user } = setup();
    await user.upload(photoInput(), exampleImage("laptop-2.webp"));
    expect(await screen.findByText("laptop-2.webp")).toBeInTheDocument();
  });

  it("restricts the native input to the allowed formats", () => {
    setup();
    expect(photoInput()).toHaveAttribute(
      "accept",
      "image/jpeg,image/png,image/webp",
    );
    expect(photoInput()).not.toHaveAttribute("multiple");
  });

  it("rejects a GIF and a renamed text file with the format message (AC-08)", async () => {
    const { user } = setup();
    const message = "Dozwolone formaty: JPG, PNG, WEBP.";
    await user.upload(
      photoInput(),
      memoryFile("anim.gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Usuń" }),
    ).not.toBeInTheDocument();

    await user.upload(
      photoInput(),
      memoryFile("fake.jpg", [0x68, 0x65, 0x6c, 0x6c, 0x6f]),
    );
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("rejects a file above 10 MB and accepts exactly 10 MB (AC-08)", async () => {
    const { user } = setup();
    const jpegHead = [0xff, 0xd8, 0xff, 0xe0];
    await user.upload(
      photoInput(),
      memoryFile("big.jpg", jpegHead, 10 * 1024 * 1024 + 1),
    );
    expect(
      await screen.findByText("Zdjęcie przekracza limit 10 MB."),
    ).toBeInTheDocument();

    await user.upload(
      photoInput(),
      memoryFile("edge.jpg", jpegHead, 10 * 1024 * 1024),
    );
    expect(await screen.findByText("edge.jpg")).toBeInTheDocument();
    expect(
      screen.queryByText("Zdjęcie przekracza limit 10 MB."),
    ).not.toBeInTheDocument();
  });

  it("removes the photo with Usuń and revokes its object URL", async () => {
    const { user } = setup();
    await user.upload(photoInput(), exampleImage("phone-1.jpg"));
    await user.click(await screen.findByRole("button", { name: "Usuń" }));
    expect(
      screen.queryByRole("img", { name: /phone-1/ }),
    ).not.toBeInTheDocument();
    expect(stubs.revoked).toEqual(["blob:mock-1"]);
    expect(
      screen.getByRole("button", { name: "Wybierz plik" }),
    ).toBeInTheDocument();
  });

  it("replaces the photo with Zmień and revokes the previous object URL", async () => {
    const { user } = setup();
    await user.upload(photoInput(), exampleImage("phone-1.jpg"));
    await screen.findByText("phone-1.jpg");
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    await user.click(screen.getByRole("button", { name: "Zmień" }));
    expect(clickSpy).toHaveBeenCalled();
    await user.upload(photoInput(), exampleImage("phone-2.jpeg"));
    expect(await screen.findByText("phone-2.jpeg")).toBeInTheDocument();
    expect(screen.queryByText("phone-1.jpg")).not.toBeInTheDocument();
    expect(stubs.revoked).toContain("blob:mock-1");
  });

  it("revokes the object URL on unmount", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { unmount } = render(<CaseForm onSubmit={vi.fn()} today={TODAY} />);
    await user.upload(photoInput(), exampleImage("phone-3.jpeg"));
    await screen.findByText("phone-3.jpeg");
    unmount();
    expect(stubs.revoked).toContain("blob:mock-1");
  });

  it("accepts a dropped file", async () => {
    setup();
    const zone = screen.getByTestId("photo-dropzone");
    fireEvent.drop(zone, {
      dataTransfer: { files: [exampleImage("laptop-2.webp")] },
    });
    expect(await screen.findByText("laptop-2.webp")).toBeInTheDocument();
  });

  it("shows the hint per case type and none before a type is chosen (AC-10)", async () => {
    const { user } = setup();
    const complaintHint = "Pokaż wyraźnie uszkodzenie lub problem.";
    const returnHint =
      "Pokaż cały sprzęt, tak aby było widać, że nie nosi śladów użytkowania.";
    expect(screen.queryByText(complaintHint)).not.toBeInTheDocument();
    expect(screen.queryByText(returnHint)).not.toBeInTheDocument();

    await user.click(radio("Zwrot"));
    expect(screen.getByText(returnHint)).toBeInTheDocument();
    await user.click(radio("Reklamacja"));
    expect(screen.getByText(complaintHint)).toBeInTheDocument();
    expect(screen.queryByText(returnHint)).not.toBeInTheDocument();
    // The hint sits above the drop zone.
    expect(
      screen
        .getByText(complaintHint)
        .compareDocumentPosition(screen.getByTestId("photo-dropzone")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("AI notice and submit (AC-11, AC-12)", () => {
  it("shows the AI notice directly above the submit button (AC-11)", () => {
    setup();
    const notice = screen.getByText(
      "Zdjęcie i opis zostaną przeanalizowane automatycznie przez system AI. Nie umieszczaj na zdjęciu danych osobowych.",
    );
    expect(
      notice.compareDocumentPosition(submitButton()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId("photo-dropzone").compareDocumentPosition(notice) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not submit an empty form, shows every message and focuses the first invalid field (AC-12)", async () => {
    const { user, onSubmit } = setup();
    await user.click(submitButton());

    expect(
      await screen.findByText("Wybierz rodzaj zgłoszenia."),
    ).toBeInTheDocument();
    expect(screen.getByText("Wybierz kategorię sprzętu.")).toBeInTheDocument();
    expect(screen.getByText(NAME_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText("Podaj datę zakupu.")).toBeInTheDocument();
    expect(screen.getByText("Dodaj zdjęcie sprzętu.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(radio("Reklamacja")).toHaveFocus());
  });

  it("focuses the first invalid field when earlier fields are valid", async () => {
    const { user, onSubmit } = setup();
    await user.click(radio("Zwrot"));
    await chooseCategory(user, "Tablet");
    await user.type(dateInput(), "20.11.2026");
    await user.click(submitButton());
    await waitFor(() => expect(nameInput()).toHaveFocus());
    expect(nameInput()).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flags only the missing photo when everything else is valid and focuses it", async () => {
    const { user, onSubmit } = setup();
    await user.click(radio("Reklamacja"));
    await chooseCategory(user, "Laptop");
    await user.type(nameInput(), "Dell XPS 13");
    await user.type(dateInput(), "20.11.2026");
    await user.type(description(), LONG_DESCRIPTION);
    await user.click(submitButton());
    expect(
      await screen.findByText("Dodaj zdjęcie sprzętu."),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Wybierz plik" }),
      ).toHaveFocus(),
    );
  });

  it("submits trimmed values and the original photo file when valid", async () => {
    const { user, onSubmit } = setup();
    await fillValid(user);
    await user.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const [values, photo] = onSubmit.mock.calls[0]!;
    expect(values).toEqual({
      caseType: "complaint",
      category: "laptop",
      productName: "Dell XPS 13",
      purchaseDate: "2026-11-20",
      description: LONG_DESCRIPTION,
    });
    expect(photo).toBeInstanceOf(File);
    expect((photo as File).name).toBe("laptop-1.png");
  });

  it("restores initialValues and initialPhoto", async () => {
    setup({
      initialValues: {
        caseType: "return",
        category: "monitor",
        productName: "LG 27",
        purchaseDate: "2026-11-01",
        description: "",
      },
      initialPhoto: exampleImage("phone-2.jpeg"),
    });
    expect(radio("Zwrot")).toBeChecked();
    expect(categorySelect()).toHaveTextContent("Monitor");
    expect(nameInput()).toHaveValue("LG 27");
    expect(dateInput()).toHaveValue("01.11.2026");
    expect(await screen.findByText("phone-2.jpeg")).toBeInTheDocument();
  });
});

describe("Case type switch (AC-13)", () => {
  it("keeps all values and re-applies the description rules", async () => {
    const { user } = setup();
    await user.click(radio("Reklamacja"));
    await chooseCategory(user, "Smartfon");
    await user.type(nameInput(), "Pixel 9");
    await user.type(dateInput(), "20.11.2026");
    await user.upload(photoInput(), exampleImage("phone-1.jpg"));
    await user.type(description(), "za krótki");
    await user.tab();
    expect(await screen.findByText(COMPLAINT_MESSAGE)).toBeInTheDocument();

    await user.click(radio("Zwrot"));
    await waitFor(() =>
      expect(screen.queryByText(COMPLAINT_MESSAGE)).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("Powód / opis problemu (opcjonalne)"),
    ).toBeInTheDocument();
    expect(categorySelect()).toHaveTextContent("Smartfon");
    expect(nameInput()).toHaveValue("Pixel 9");
    expect(dateInput()).toHaveValue("20.11.2026");
    expect(description()).toHaveValue("za krótki");
    expect(screen.getByText("phone-1.jpg")).toBeInTheDocument();

    await user.click(radio("Reklamacja"));
    expect(await screen.findByText(COMPLAINT_MESSAGE)).toBeInTheDocument();
    expect(description()).toHaveValue("za krótki");
  });

  it("does not show a description error for an untouched field", async () => {
    const { user } = setup();
    await user.click(radio("Reklamacja"));
    await user.click(radio("Zwrot"));
    await user.click(radio("Reklamacja"));
    expect(screen.queryByText(COMPLAINT_MESSAGE)).not.toBeInTheDocument();
  });
});

describe("Keyboard operation (AC-42)", () => {
  it("moves between case types with arrow keys and selects with Space", async () => {
    const { user } = setup();
    await user.tab();
    expect(radio("Reklamacja")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(radio("Zwrot")).toHaveFocus());
    await user.keyboard(" ");
    await waitFor(() => expect(radio("Zwrot")).toBeChecked());
    expect(radio("Reklamacja")).not.toBeChecked();
  });

  it("opens the category select and picks an option with the keyboard", async () => {
    const { user } = setup();
    categorySelect().focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() =>
      expect(categorySelect()).not.toHaveTextContent("Wybierz kategorię"),
    );
    expect(categorySelect()).toHaveFocus();
  });

  it("reaches the date field and the file button with Tab and activates the button with Enter", async () => {
    const { user } = setup();
    nameInput().focus();
    await user.tab();
    expect(dateInput()).toHaveFocus();
    await user.type(dateInput(), "20.11.2026");
    expect(dateInput()).toHaveValue("20.11.2026");

    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
    const choose = screen.getByRole("button", { name: "Wybierz plik" });
    choose.focus();
    await user.keyboard("{Enter}");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("keeps the hidden native file input out of the tab order", () => {
    setup();
    expect(photoInput()).toHaveAttribute("tabindex", "-1");
  });
});

describe("Processing error banner (AC-17)", () => {
  it("shows the banner text with a retry button that calls onRetry", async () => {
    const onRetry = vi.fn();
    const { user } = setup({
      bannerError: "Nie udało się przetworzyć zgłoszenia.",
      onRetry,
    });
    const alert = screen.getByRole("alert");
    expect(
      within(alert).getByText("Nie udało się przetworzyć zgłoszenia."),
    ).toBeInTheDocument();
    await user.click(
      within(alert).getByRole("button", { name: "Spróbuj ponownie" }),
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders no banner by default", () => {
    setup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
