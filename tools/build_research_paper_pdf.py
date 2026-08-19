from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "VaultLab_Research_Paper.pdf"


def p(text, style):
    return Paragraph(text, style)


def build():
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "Body",
        parent=styles["BodyText"],
        fontName="Times-Roman",
        fontSize=12,
        leading=18,
        spaceAfter=6,
        alignment=TA_LEFT,
    )
    h1 = ParagraphStyle(
        "H1",
        parent=body,
        fontName="Times-Bold",
        fontSize=14,
        leading=21,
        spaceBefore=10,
        spaceAfter=5,
    )
    title = ParagraphStyle(
        "Title",
        parent=body,
        fontName="Times-Bold",
        fontSize=14,
        leading=20,
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    centered = ParagraphStyle("Centered", parent=body, alignment=TA_CENTER)
    small = ParagraphStyle("Small", parent=body, fontSize=9.5, leading=12)

    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=letter,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
    )

    story = [
        p("VaultLab: AI-Powered Pole Vault Video Analysis for Technique Feedback and Performance Prediction", title),
        p("Jaya Xu<br/>STEM Research & Innovation - Information Technology<br/>August 2026", centered),
        Spacer(1, 6),
        p("Project Objectives", h1),
        p("VaultLab is a web application that helps pole vault athletes convert ordinary side-view vault videos into measurable technical feedback. The project objective is to build an accessible AI-assisted analysis system that detects body landmarks, estimates vault phases, calculates technique variables, and prepares a dataset that can later train a predictive model for whether a vault is a make or miss.", body),
        p("The research question is: Can computer vision and interpretable machine learning identify which measurable technique variables are most associated with successful pole vault clearances?", body),
        p("The current prototype focuses on three deliverables: a React web app for video upload and attempt logging, a pose-estimation pipeline for extracting joint-based measurements, and a research workflow that exports labeled attempt data for logistic regression.", body),
        p("Background and Motivation", h1),
        p("Pole vault is a technically complex event because performance depends on runway speed, pole plant timing, takeoff mechanics, swing, inversion, and bar clearance. Athletes often rely on coaches visually reviewing video, but not every athlete has access to advanced biomechanical tools. A low-cost web app that extracts approximate measurements from a phone video could make feedback more available to developing athletes.", body),
        p("Biomechanics research supports the importance of measurable variables. Linthorne and colleagues reported that peak vault height increased by about 0.54 m for each 1 m/s increase in run-up velocity in a case study of an experienced vaulter. This supports using approach speed as a core feature rather than treating vault success as only a subjective technique judgment.", body),
        p("Recent markerless biomechanics studies show that computer vision is becoming realistic for pole vault analysis, but also show why a student project should be honest about uncertainty. Bissas and Cronin evaluated a markerless system in an elite competition setting using four cameras and reported strong agreement for center-of-mass and step velocity variables, while joint angles at takeoff remained less precise. This motivates VaultLab's design: show estimated values, preserve manual review, and collect data for validation.", body),
        p("Methodology / Technical Approach", h1),
        p("VaultLab uses a React + Vite + TypeScript frontend hosted on Firebase. The athlete signs in or enters competition demo mode, uploads a vault video, enters known attempt information such as bar height, grip height, approach distance, approach time, and make/miss result, then runs full-video pose analysis.", body),
        p("The prototype uses MediaPipe Pose Landmarker in the browser. Google's documentation describes the task as a way to detect human body landmarks from images or video and return pose landmarks in image coordinates and world coordinates. VaultLab samples frames across the uploaded video, applies pose estimation, and draws a skeleton overlay so users can visually inspect whether the AI is tracking the athlete.", body),
        p("The app then estimates three major phases: takeoff, maximum inversion, and clearance. From these frames, it calculates or stores the following variables.", body),
    ]

    data = [
        ["Variable", "How VaultLab estimates it", "Use in model"],
        ["Approach speed", "Approach distance divided by approach time.", "Predictor of make/miss."],
        ["Takeoff angle", "Pose landmarks near takeoff.", "Takeoff posture feature."],
        ["Inversion angle", "Shoulder-hip-ankle angle.", "Swing and rock-back feature."],
        ["Grip over bar", "Grip height minus bar height.", "Context feature."],
        ["Flight time", "Clearance time minus takeoff time.", "Phase timing feature."],
        ["Result label", "Athlete records make or miss.", "Target variable."],
    ]
    table = Table(data, colWidths=[1.45 * inch, 2.55 * inch, 2.25 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E8EEF5")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#808080")),
        ("FONT", (0, 0), (-1, 0), "Times-Bold", 9.5),
        ("FONT", (0, 1), (-1, -1), "Times-Roman", 9.3),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.extend([
        table,
        Spacer(1, 8),
        p("The next research layer is logistic regression. Logistic regression is appropriate for this first model because the target variable is binary: make or miss. The exported dataset can be represented as rows of attempts and columns of features. A future Python notebook will standardize features, train a logistic regression classifier, evaluate accuracy with train/test splits or cross-validation, and inspect feature coefficients to explain which variables have the strongest relationship with success.", body),
        p("Key Innovation", h1),
        p("The key innovation is not only uploading a sports video. The innovation is connecting four layers into one athlete-facing workflow: pose estimation, vault-specific biomechanical feature extraction, interpretable predictive modeling, and coaching feedback. Most video tools allow manual drawing or review; VaultLab aims to turn video into a structured dataset that can support both athlete learning and research.", body),
        p("This is especially relevant because pole-vault-specific public datasets and automated phase-segmentation tools are limited. VaultLab therefore treats the app itself as a data collection instrument. Each saved attempt becomes a labeled example that can improve the model over time.", body),
        p("Results / Findings", h1),
        p("The current prototype has been implemented and deployed. It can authenticate users, offer a demo mode for judges, upload and preview a full vault video, run browser-based pose estimation, display joint markers on the video, estimate takeoff and inversion measurements, calculate approach speed and flight time when enough data is entered, store attempts in a user-specific log, and export attempt data as CSV.", body),
        p("The prototype also includes a Competition Research Mode panel. This panel counts total saved attempts, identifies how many rows are model-ready, displays the make rate, and clarifies that the prediction target is make/miss. This directly connects the web app to the planned logistic-regression study.", body),
        p("The most important early finding is a design finding: the app must present measurements as estimates, not absolute truth. Single-camera videos can have camera-angle error, motion blur, occlusion from the pole, and inverted poses that are difficult for general pose models. Therefore, VaultLab emphasizes reviewable phase estimates and dataset export before claiming final predictive accuracy.", body),
        p("Impact / Future Development", h1),
        p("VaultLab could help high school athletes and coaches receive more objective feedback from videos they already record. Instead of saying only that a vault looked good or bad, the app encourages athletes to compare speed, takeoff posture, inversion, grip, and result across attempts.", body),
        p("The next stage is to collect 30-50 labeled vault attempts, train the first logistic regression model, and report metrics such as accuracy, precision, recall, and the most influential coefficients. Later versions could add cloud storage, Firestore data sync, a Python backend with YOLO Pose or RTMPose, pole and bar detection, and two-camera calibration for more accurate measurements.", body),
        p("For the competition, the project demonstrates a full STEM innovation cycle: identify a real athletic problem, build a working AI prototype, connect it to a research question, collect structured data, and design an interpretable model that can guide improvement.", body),
        p("References", h1),
        p("Bissas, A., & Cronin, N. J. (2026). Evaluating markerless biomechanical analysis in a real-world pole vault competition setting. PLOS One, 21(3), e0329987. https://doi.org/10.1371/journal.pone.0329987", small),
        p("Google AI Edge. (2026). Pose landmark detection guide. https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker", small),
        p("Google Firebase. (2026). Get started with Firebase Authentication on websites. https://firebase.google.com/docs/auth/web/start", small),
        p("Linthorne, N. P., Guzman, M. S., & Bridgett, L. A. (2012). Effects of run-up velocity on performance, kinematics, and energy exchanges in the pole vault. Journal of Sports Science and Medicine, 11(2), 245-254. https://pmc.ncbi.nlm.nih.gov/articles/PMC3737876/", small),
        p("scikit-learn developers. (2026). LogisticRegression. https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html", small),
    ])

    doc.build(story)
    print(OUT)


if __name__ == "__main__":
    build()
