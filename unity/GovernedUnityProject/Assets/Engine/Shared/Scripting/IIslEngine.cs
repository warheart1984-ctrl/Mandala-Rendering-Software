// mirrors engine/scripting/IIslEngine.cs
using SovereignX.CIEMS.Engine.Runtime;

namespace SovereignX.CIEMS.Engine.Scripting
{
    public interface IIslEngine
    {
        IntentRecord CompileAndEvaluate(string islSource, string contextJson);
    }
}
