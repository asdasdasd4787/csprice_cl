@ECHO OFF
SET BLENDER=%~dp0..\tools\blender51\blender.exe
SET BLEND=%~1
SET OUT=%~2
IF "%BLEND%"=="" SET BLEND=%USERPROFILE%\Desktop\akcartel.blend
IF "%OUT%"=="" SET OUT=%~dp0..\assets\models\cartel.glb
IF NOT EXIST "%BLENDER%" (
  ECHO Blender 5.1 portable not found at tools\blender51
  EXIT /B 1
)
"%BLENDER%" "%BLEND%" --background --python "%~dp0export_blend_glb.py" -- "%OUT%"
IF %ERRORLEVEL% NEQ 0 EXIT /B %ERRORLEVEL%
COPY /Y "%OUT%" "%~dp0..\assets\models\skins\aq_ak47_cartel.glb" >NUL
ECHO Exported %OUT%
