// Canonical Governed Timeline DTO.



using System;

using System.Collections.Generic;



namespace SovereignX.CIEMS.Engine.Dto

{

    [Serializable]

    public class GovernedTimelineDto

    {

        public string id;

        public string name;

        public float durationSec = 12f;

        public List<GovernedTrackDto> tracks = new List<GovernedTrackDto>();

    }



    [Serializable]

    public class GovernedTrackDto

    {

        public string id;

        public string binding;

        public List<GovernedClipDto> clips = new List<GovernedClipDto>();

    }



    [Serializable]

    public class GovernedClipDto

    {

        public string id;

        public string start;      // timecode "00:00:00.000" (optional)

        public string duration;   // timecode (optional)

        public float startSec;

        public float durationSec;

        public string action;

        public GovernedClipPayloadDto payload;

    }



    [Serializable]

    public class GovernedClipPayloadDto

    {

        public string param;

        public float from;

        public float to;

        public float speed;

        public string[] planes;

    }

}

