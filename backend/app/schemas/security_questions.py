from pydantic import BaseModel


class SecurityQuestionPrompt(BaseModel):
    position: int
    question_key: str
    question_label: str


class SecurityQuestionAnswerInput(BaseModel):
    question_key: str
    answer: str


class SecurityQuestionSetupRequest(BaseModel):
    answers: list[SecurityQuestionAnswerInput]


class ForgotPasswordStartRequest(BaseModel):
    email: str


class ForgotPasswordStartResponse(BaseModel):
    configured: bool
    questions: list[SecurityQuestionPrompt] = []
    message: str


class ForgotPasswordVerifyRequest(BaseModel):
    email: str
    answers: list[SecurityQuestionAnswerInput]


class ForgotPasswordVerifyResponse(BaseModel):
    reset_token: str
