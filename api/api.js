var userModel = require('../models/user');
var classModel = require('../models/class');
var recordModel = require('../models/record');
const mongo = require('mongodb');

const Excel = require('exceljs')

//Function that returns the details of each class
async function forClassDeatils(classId) {

    var classroom = await classModel.findById(classId)

    var studentPromise = classroom.students.map(async (stuId) => {
        var students = await userModel.findById(stuId)
        //console.log(students)
        return students
    });

    var stuArray = await Promise.all(studentPromise)

    var resp = await recordModel.find({ 'data.Class': classId.toString() })

    var response = JSON.parse(JSON.stringify(resp))
    var totalP = 0
    for (i = 0; i < stuArray.length; i++) {
        var k = 0;
        let student = stuArray[i]
        for (j = 0; j < response.length; j++) {
            for (w = 0; w < response[j].data.Name.length; w++) {
                if (student.name == response[j].data.Name[w]) {
                    k++
                }
            }
        }
        totalP += k
        stuArray[i]["counts"] = k.toString()
        if (classroom.totLec == 0)
            stuArray[i]["percent"] = 0
        else
            stuArray[i]["percent"] = ((k / (classroom.totLec)) * 100).toFixed(2).toString()

        classroom.studentDetails = stuArray
    }
    if (classroom.totLec == 0)
        var totalPercent = 0
    else
        var totalPercent = (((totalP) / (classroom.totLec * stuArray.length)) * 100).toFixed(2).toString()


    var obj = { classroom: classroom, stuArray: stuArray, totalPercent: totalPercent, totalP: totalP }

    return obj


}

//Function that returns all the classes of the teacher
async function forTeacherClasses(teacherId) {

    var allClasses = []
    var classrooms = await classModel.find({ 'owner': teacherId })

    for (classes of classrooms) {
        var obj = forClassDeatils(classes._id)
        var ob = await obj
        var classroom = ob.classroom
        var stuArray = ob.stuArray
        classroom.studentDetails = stuArray
        classroom.totalP = ob.totalP
        classroom.totalPercent = ob.totalPercent
        allClasses.push(classroom)
    }

    //console.log(allClasses[0].studentDetails)

    return allClasses
}

//students of a teacher i.e part of aleast one class
async function myClassStudents(classes,teacherId){

    var classrooms = classes;
    var users = await userModel.find({ 'who': "1" });

    //let notInMyClassStudents = [];
    let InMyClassStudents = [];
    for(classroom of classrooms){ 
        users.map((user) => {
            classroom.students.map((stuId) => {
                if (stuId.equals(user._id) ) {
                    flag = 0
                    for(myStudent of InMyClassStudents){
                        if(myStudent._id.equals(stuId)){
                            flag=1
                            break;
                        }
                    }
                    if(flag==0){
                        InMyClassStudents.push(user);
                    }
                }
            });
        });
    }
    return InMyClassStudents;
}

//Function that creates a XL file for the face recognition model
async function creatXl(classId) {

    let workbook = new Excel.Workbook()
    let worksheet = workbook.addWorksheet('students_db')

    worksheet.columns = [
        { header: 'name', key: 'name' },
        { header: 'image', key: 'image' },
        { header: 'roll_no', key: 'roll_no' },
        { header: 'classid', key: 'classid' }
    ]

    var data = await classModel.findById({ _id: classId })
    //console.log(data)
    var l = data.students.length
    var stu = data.students

    for (i = 0; i < l; i++) {
        var a = stu[i]
        var student = await userModel.findById(a)
        var obj = {}
        obj["name"] = student.name
        obj["image"] = student.rollnumber + ".jpg"
        obj["roll_no"] = student.rollnumber
        obj["classid"] = JSON.parse(JSON.stringify(data._id))

        worksheet.addRow(obj)
        workbook.xlsx.writeFile('./Py-Scripts/students/students_db.xlsx')
    }
}

//Function that creates a XL file for the attendance 
async function createXlAttSheet(classes) {
    
    let workbook = new Excel.Workbook()
    // workbook.views = [
    //     {
    //       x: 0, y: 0, width: 10000, height: 20000,
    //       firstSheet: 0, activeTab: 1, visibility: 'visible'
    //     }
    //   ]
    let worksheet = workbook.addWorksheet('attendance_sheet')
    var columns=[
        { header: 'SrNo',key:'SrNo'},
        { header: 'Rollno',key: 'Rollno',width: 10},
        { header: 'Name',key: 'Name',width: 15},
    ]
    for(i=0;i<classes.length;i++){
        columns.push({header: classes[i].name,key:classes[i].name,width: 15})
    }
    worksheet.columns = columns
    var users = await myClassStudents(classes,classes[0].owner);

    for(k=0;k<users.length;k++){
        var obj = forUserClasses(users[k]._id)
        await obj.then(ob => {
            for (i = 0; i < ob.classes.length; i++) {
                var classroom = ob.classes[i]
                for (j = 0; j < classroom.studentDetails.length; j++) {
                    var student = classroom.studentDetails[j]
                    if (student.name == users[k].name) {
                        ob.classes[i].studentDetails = student
                        break
                    }
                }
            }
            var object = {}
            object["SrNo"]=k+1
            object["Rollno"]=users[k].rollnumber
            object["Name"]=users[k].name
            for(z=0;z<ob.classes.length;z++){
                var classroom=ob.classes[z]
                object[classroom.name] = classroom.studentDetails.percent
            }
            worksheet.addRow(object)
            const row = worksheet.getRow(k+2);
            for(classroom of classes){
                if(row.getCell(classroom.name).value==null){
                    row.getCell(classroom.name).value="Not a part"
                }
            }
        });
        let today = new Date().toDateString();
        var filename="./XLS_FILES/attendance_sheet/attendance_sheet - "+today+".xlsx";
        workbook.xlsx.writeFile(filename);
    }
}

//Function which calculates the attendance of a student 
async function studentAttendance(stuId) {

    var student = await userModel.findById(stuId)

    var resp = await recordModel.find({ 'data.RollNo': parseInt(student.rollnumber) })
    //console.log(resp)
    if (resp.length > 0) {
        var response = JSON.parse(JSON.stringify(resp))
        var totalStuRecords = resp.length
        var totalStuLecs = 0
        var mark = []
        for (record of response) {
            if (mark.length > 0) {
                var found = false
                for (var i = 0; i < mark.length; i++) {
                    if (mark[i].id == record.data.Class[0]) {
                        found = true
                        break
                    }
                }
                if (found) {
                    continue
                }
                var classId = record.data.Class[0]
                var obj = forClassDeatils(classId)
                var ob = await obj
                var classroom = ob.classroom
                mark.push(classroom)
                //console.log(classroom)
                totalStuLecs += classroom.totLec
            }
            else {
                var classId = record.data.Class[0]
                var obj = forClassDeatils(classId)
                var ob = await obj
                var classroom = ob.classroom
                mark.push(classroom)
                //console.log(classroom)
                totalStuLecs += classroom.totLec
            }
        }
        var attendance = ((totalStuRecords / totalStuLecs) * 100).toFixed(2).toString()
    } else {
        var classes = await classModel.find({ 'students': student._id })
        //console.log(classes)
        if (classes.length == 0) {
            attendance = -1
        }
        else {
            attendance = 0
        }
    }
    return attendance
}

//Function to return the attendance and all the classes he/she is in 
async function forUserClasses(stuId) {

    var allClasses = []
    var student = await userModel.findById(stuId)

    var resp = await recordModel.find({ 'data.RollNo': parseInt(student.rollnumber) })
    if (resp.length > 0) {

        var response = JSON.parse(JSON.stringify(resp))

        var totalStuRecords = resp.length
        var totalStuLecs = 0
        for (record of response) {
            if (allClasses.length > 0) {
                var found = false
                for (var i = 0; i < allClasses.length; i++) {
                    if (allClasses[i].id == record.data.Class[0]) {
                        found = true
                        break
                    }
                }
                if (found) {
                    continue
                }
                var classId = record.data.Class[0]
                //console.log(classId)
                var obj = forClassDeatils(classId)
                var ob = await obj
                var classroom = ob.classroom
                var owner = await userModel.find({ '_id': classroom.owner })
                classroom['teacher'] = owner[0].name
                allClasses.push(classroom)
                totalStuLecs += classroom.totLec
            }
            else {
                var classId = record.data.Class[0]
                var obj = forClassDeatils(classId)
                var ob = await obj
                var classroom = ob.classroom
                var owner = await userModel.find({ '_id': classroom.owner })
                classroom['teacher'] = owner[0].name
                allClasses.push(classroom)
                totalStuLecs += classroom.totLec
            }

        }
        var attendance = ((totalStuRecords / totalStuLecs) * 100).toFixed(2).toString()
    } else {
        var classes = await classModel.find({ 'students': student._id })
        if (classes.length == 0) {
            totalStuRecords = 0
            attendance = -1
        }
        else {
            totalStuRecords = 0
            attendance = 0
            for (var i = 0; i < classes.length; i++) {
                var classId = classes[i]._id
                var obj = forClassDeatils(classId)
                var ob = await obj
                var classroom = ob.classroom
                var owner = await userModel.find({ '_id': classroom.owner })
                classroom['teacher'] = owner[0].name
                allClasses.push(classroom)
            }
        }
    }
    var obj = { attendance: attendance, classes: allClasses, totalLecs: totalStuRecords }

    return obj

}

async function getOwner(id) {
    var owner = await userModel.find({ '_id': id })
    var obj = { name: owner[0].name }
    return obj
}

// Function to get all lectures taken by the teacher
async function allLecTeacher(ownerId) {
    var resp = await recordModel.find({ 'owner': ownerId.toString() }); // get all attendance for this teacher
    return resp;
}

async function removeStudent(classId, studentId) {

    var students = await userModel.findById(studentId);
    var student = JSON.parse(JSON.stringify(students))

    var name = student.name;

    //var records = await recordModel.deleteMany({ "data.Name": name })

    var del = await classModel.findOneAndUpdate({ _id: classId }, { $pull: { "students": studentId } }, { new: true })

}

//function to check if student is already a part of class or if class with that code exists
async function forJoinClass(classCode, user) {
    var classroom = await classModel.findOne({ classCode: classCode })
    let flag = 0
    if (classroom) {
        classroom.students.map((stuId) => {
            if (stuId.equals(user._id)) {
                flag = 1
            }
        });
    }
    else {
        flag = 2
    }
    return flag
}

async function compare(query) {

    var records = await recordModel.find({ 'AttendanceRecord': { "$regex": query, "$options": "i" } })
    var response = JSON.parse(JSON.stringify(records))
    var absentees = []

    for (record of response) {
        var classID = record.data.Class[0]
        var studentPresent = record.data.Name

        var obj = forClassDeatils(String(classID))
        var data = await obj
        //console.log(data.classroom.name)

        var students = data.stuArray
        var studentName = []

        for (j = 0; j < students.length; j++) {
            studentName.push(students[j].name)
        }

        var a = findDeselectedItem(studentName, studentPresent)
        //console.log(a)
        if (a.length == 0) {
            continue
        }
        if (a.length == studentName.length) {
            var ob = { 'class': data.classroom.name, 'absentees': ['Mass Bunk'], "date": query }
            absentees.push(ob)
        }

        else {
            var ob = { 'class': data.classroom.name, 'absentees': a, "date": query }
            absentees.push(ob)
        }

    }

    return absentees
}

function findDeselectedItem(a1, a2) {

    var absent = a1.filter(e => !a2.includes(e));
    return absent
}

async function downloadXL(data) {
    
    let workbook = new Excel.Workbook()
    let worksheet = workbook.addWorksheet('students_db')

    worksheet.columns = [
        { header: 'name', key: 'name' },
        { header: 'class', key: 'class' },
        { header: 'date', key: 'date' },
    ]
    var l = data.length

    for (i = 0; i < l; i++) {
        var students = data[i].absentees
        for (j = 0; j < students.length; j++) {
            var obj = {}
            obj["name"] = students[j]
            obj["class"] = data[i].class
            obj["date"] = data[i].date
            worksheet.addRow(obj)
            var filename="./XLS_FILES/absent/absent-"+data[i].date+".xlsx"
            workbook.xlsx.writeFile(filename)
        }
    }
}

module.exports = { forClassDeatils, forTeacherClasses, creatXl,createXlAttSheet, studentAttendance, forUserClasses, allLecTeacher, removeStudent, forJoinClass, getOwner, compare, downloadXL }