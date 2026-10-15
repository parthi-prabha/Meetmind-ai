from sarvamai import SarvamAI

client = SarvamAI(
    base_url="https://api.sarvam.ai/",
    
    api_subscription_key="sk_0nnmevi1_Mk1K6tdApieaKJq6Q3h4fH7E",
)

client.speech_to_text.transcribe(
    file="D:\research\international\meetmind-ai\conversational-speech-dataset\conversational_english\conversations\data\meeting_300.wav",
)
